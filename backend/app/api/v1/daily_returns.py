import csv
import io
import uuid
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.metrics import calculate_equity_curve, calculate_metrics, calculate_rolling_metrics
from app.models.pm import DailyReturn, PM, PMLeverageHistory
from app.schemas.daily_return import DailyReturnCreate, DailyReturnResponse, UploadResult

router = APIRouter()

ANOMALY_THRESHOLD = Decimal("0.5")


def _check_anomaly(return_pct: Decimal) -> bool:
    return abs(return_pct) > ANOMALY_THRESHOLD


async def _get_pm_or_404(pm_id: uuid.UUID, db: AsyncSession) -> PM:
    pm = await db.get(PM, pm_id)
    if pm is None:
        raise HTTPException(status_code=404, detail="PM not found")
    return pm


async def _existing_dates(pm_id: uuid.UUID, db: AsyncSession) -> set[date]:
    result = await db.execute(
        select(DailyReturn.date).where(DailyReturn.pm_id == pm_id)
    )
    return {row[0] for row in result.all()}


async def _db_last_date(pm_id: uuid.UUID, db: AsyncSession) -> date | None:
    result = await db.execute(
        select(func.max(DailyReturn.date)).where(DailyReturn.pm_id == pm_id)
    )
    return result.scalar_one_or_none()


def _find_gaps(sorted_dates: list[date]) -> list[date]:
    missing = []
    for i in range(1, len(sorted_dates)):
        d = sorted_dates[i - 1] + timedelta(days=1)
        while d < sorted_dates[i]:
            missing.append(d)
            d += timedelta(days=1)
    return missing


@router.post("/pms/{pm_id}/returns/upload-csv", response_model=UploadResult)
async def upload_csv(
    pm_id: uuid.UUID,
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
):
    await _get_pm_or_404(pm_id, db)

    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    # --- parse CSV rows first, collect parse errors ---
    rows: list[tuple[int, date, Decimal]] = []
    parse_errors: list[str] = []

    reader = csv.DictReader(io.StringIO(text))
    for lineno, row in enumerate(reader, start=2):
        raw_date = (row.get("date") or "").strip()
        raw_ret = (row.get("return_pct") or "").strip()

        if not raw_date and not raw_ret:  # skip blank/trailing rows
            continue

        try:
            d = date.fromisoformat(raw_date)
        except (ValueError, TypeError):
            parse_errors.append(f"第 {lineno} 行：日期格式錯誤（{raw_date!r}）")
            continue

        try:
            ret = Decimal(raw_ret)
        except (InvalidOperation, TypeError):
            parse_errors.append(f"第 {lineno} 行（{d}）：return_pct 格式錯誤（{raw_ret!r}）")
            continue

        rows.append((lineno, d, ret))

    if parse_errors:
        raise HTTPException(status_code=400, detail={"errors": parse_errors})

    if not rows:
        raise HTTPException(status_code=400, detail={"errors": ["CSV 無有效資料"]})

    csv_dates = sorted({d for _, d, _ in rows})

    # --- continuity check within CSV ---
    missing = _find_gaps(csv_dates)
    if missing:
        missing_str = ", ".join(str(d) for d in missing)
        raise HTTPException(
            status_code=400,
            detail={"errors": [f"缺少日期：{missing_str}"]},
        )

    # --- DB continuity check ---
    last_db_date = await _db_last_date(pm_id, db)
    if last_db_date is not None:
        expected_start = last_db_date + timedelta(days=1)
        if csv_dates[0] != expected_start:
            raise HTTPException(
                status_code=400,
                detail={
                    "errors": [
                        f"DB 最後日期為 {last_db_date}，CSV 應從 {expected_start} 開始"
                        f"（目前 CSV 起始日期為 {csv_dates[0]}）"
                    ]
                },
            )

    # --- build records ---
    warnings: list[str] = []
    to_insert: list[DailyReturn] = []

    for lineno, d, ret in rows:
        flag = None
        if _check_anomaly(ret):
            flag = "anomaly"
            warnings.append(f"第 {lineno} 行（{d}）：return_pct={ret} 超過 ±50%，標記 anomaly")
        to_insert.append(
            DailyReturn(
                pm_id=pm_id,
                date=d,
                return_pct=ret,
                source_type="self_reported",
                flag=flag,
            )
        )

    for record in to_insert:
        db.add(record)
    await db.commit()

    # --- Gap-fill the full date sequence for this PM ---
    all_dr_result = await db.execute(
        select(DailyReturn.date, DailyReturn.source_type)
        .where(DailyReturn.pm_id == pm_id)
        .order_by(DailyReturn.date.asc())
    )
    all_dr_rows: list[tuple[date, str]] = [(r[0], r[1] or "self_reported") for r in all_dr_result.all()]
    all_dr_dates = [r[0] for r in all_dr_rows]
    gaps = _find_gaps(all_dr_dates)
    if gaps:
        ri = 0
        for gap_date in gaps:
            while ri + 1 < len(all_dr_rows) and all_dr_rows[ri + 1][0] < gap_date:
                ri += 1
            src = all_dr_rows[ri][1]
            db.add(DailyReturn(
                pm_id=pm_id,
                date=gap_date,
                return_pct=Decimal("0"),
                source_type="gap_filled",
                is_verified=False,
                flag="gap_filled",
            ))
        await db.commit()

    # --- Auto-update leverage history start_date if this is the first upload ---
    csv_first_date = csv_dates[0]
    leverage_start_updated = False
    leverage_start_date: date | None = None

    lev_result = await db.execute(
        select(PMLeverageHistory).where(PMLeverageHistory.pm_id == pm_id)
    )
    lev_rows = lev_result.scalars().all()

    if len(lev_rows) == 1 and lev_rows[0].start_date > csv_first_date:
        lev_rows[0].start_date = csv_first_date
        await db.commit()
        leverage_start_updated = True
        leverage_start_date = csv_first_date

    return UploadResult(
        inserted=len(to_insert),
        skipped=0,
        warnings=warnings,
        errors=[],
        leverage_start_updated=leverage_start_updated,
        leverage_start_date=str(leverage_start_date) if leverage_start_date else None,
    )


@router.post("/pms/{pm_id}/returns", response_model=DailyReturnResponse, status_code=201)
async def create_return(
    pm_id: uuid.UUID,
    payload: DailyReturnCreate,
    db: AsyncSession = Depends(get_db),
):
    await _get_pm_or_404(pm_id, db)

    existing = await _existing_dates(pm_id, db)
    if payload.date in existing:
        raise HTTPException(status_code=400, detail=f"日期 {payload.date} 已存在")

    last_db_date = await _db_last_date(pm_id, db)
    if last_db_date is not None:
        expected = last_db_date + timedelta(days=1)
        if payload.date != expected:
            raise HTTPException(
                status_code=400,
                detail=f"DB 最後日期為 {last_db_date}，應新增 {expected}（收到 {payload.date}）",
            )

    flag = "anomaly" if _check_anomaly(payload.return_pct) else None
    record = DailyReturn(
        pm_id=pm_id,
        date=payload.date,
        return_pct=payload.return_pct,
        source_type=payload.source_type,
        flag=flag,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


async def _fetch_leverage_history(pm_id: uuid.UUID, db: AsyncSession) -> list[dict]:
    result = await db.execute(
        select(
            PMLeverageHistory.start_date,
            PMLeverageHistory.end_date,
            PMLeverageHistory.leverage,
        ).where(PMLeverageHistory.pm_id == pm_id)
    )
    return [
        {"start_date": row[0], "end_date": row[1], "leverage": row[2]}
        for row in result.all()
    ]


async def _fetch_returns(
    pm_id: uuid.UUID,
    db: AsyncSession,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> list[tuple[date, Decimal]]:
    stmt = select(DailyReturn.date, DailyReturn.return_pct).where(DailyReturn.pm_id == pm_id)
    if start_date:
        stmt = stmt.where(DailyReturn.date >= start_date)
    if end_date:
        stmt = stmt.where(DailyReturn.date <= end_date)
    stmt = stmt.order_by(DailyReturn.date.asc())
    result = await db.execute(stmt)
    return [(row[0], Decimal(str(row[1]))) for row in result.all()]


@router.get("/pms/{pm_id}/metrics")
async def get_metrics(
    pm_id: uuid.UUID,
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    risk_free_rate: float = Query(0.0),
    db: AsyncSession = Depends(get_db),
):
    await _get_pm_or_404(pm_id, db)
    returns = await _fetch_returns(pm_id, db, start_date, end_date)

    if len(returns) < 2:
        raise HTTPException(status_code=400, detail="資料不足，至少需要 2 筆")

    lev_hist = await _fetch_leverage_history(pm_id, db)
    metrics = calculate_metrics(returns, risk_free_rate, leverage_history=lev_hist)
    rolling_90 = calculate_rolling_metrics(returns, 90, risk_free_rate)
    rolling_180 = calculate_rolling_metrics(returns, 180, risk_free_rate)

    return {
        **metrics,
        "track_record_start": str(metrics["track_record_start"]),
        "track_record_end": str(metrics["track_record_end"]),
        "rolling_sharpe_90d": [
            {"date": str(p["date"]), "sharpe": p["sharpe"]} for p in rolling_90
        ],
        "rolling_sharpe_180d": [
            {"date": str(p["date"]), "sharpe": p["sharpe"]} for p in rolling_180
        ],
    }


@router.get("/pms/{pm_id}/equity-curve")
async def get_equity_curve(
    pm_id: uuid.UUID,
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    await _get_pm_or_404(pm_id, db)
    returns = await _fetch_returns(pm_id, db, start_date, end_date)
    lev_hist = await _fetch_leverage_history(pm_id, db)
    curve = calculate_equity_curve(returns, leverage_history=lev_hist)
    return [{"date": str(p["date"]), "nav": p["nav"], "std_nav": p["std_nav"]} for p in curve]


@router.get("/pms/{pm_id}/returns", response_model=list[DailyReturnResponse])
async def list_returns(
    pm_id: uuid.UUID,
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    await _get_pm_or_404(pm_id, db)

    stmt = select(DailyReturn).where(DailyReturn.pm_id == pm_id)
    if start_date:
        stmt = stmt.where(DailyReturn.date >= start_date)
    if end_date:
        stmt = stmt.where(DailyReturn.date <= end_date)
    stmt = stmt.order_by(DailyReturn.date.asc())

    result = await db.execute(stmt)
    return result.scalars().all()
