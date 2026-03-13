import csv
import io
import uuid
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.pm import DailyReturn, PM
from app.schemas.daily_return import DailyReturnCreate, DailyReturnResponse, UploadResult

router = APIRouter()

ANOMALY_THRESHOLD = Decimal("0.5")
GAP_WARN_DAYS = 7


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


def _check_gaps(dates: list[date]) -> list[str]:
    warnings = []
    sorted_dates = sorted(dates)
    for i in range(1, len(sorted_dates)):
        delta = (sorted_dates[i] - sorted_dates[i - 1]).days
        if delta > GAP_WARN_DAYS:
            warnings.append(
                f"日期 gap 超過 {GAP_WARN_DAYS} 天：{sorted_dates[i-1]} → {sorted_dates[i]}（相差 {delta} 天）"
            )
    return warnings


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

    existing = await _existing_dates(pm_id, db)

    inserted = 0
    skipped = 0
    warnings: list[str] = []
    errors: list[str] = []
    to_insert: list[DailyReturn] = []
    new_dates: list[date] = []

    reader = csv.DictReader(io.StringIO(text))
    for lineno, row in enumerate(reader, start=2):
        raw_date = (row.get("date") or "").strip()
        raw_ret = (row.get("return_pct") or "").strip()

        # parse date
        try:
            d = date.fromisoformat(raw_date)
        except (ValueError, TypeError):
            errors.append(f"第 {lineno} 行：日期格式錯誤（{raw_date!r}）")
            continue

        # parse return_pct
        try:
            ret = Decimal(raw_ret)
        except (InvalidOperation, TypeError):
            errors.append(f"第 {lineno} 行（{d}）：return_pct 格式錯誤（{raw_ret!r}）")
            continue

        # duplicate check
        if d in existing:
            skipped += 1
            errors.append(f"第 {lineno} 行（{d}）：日期已存在，略過")
            continue

        # anomaly flag
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
        existing.add(d)
        new_dates.append(d)

    # gap check across all new dates
    if new_dates:
        warnings.extend(_check_gaps(new_dates))

    for record in to_insert:
        db.add(record)
    if to_insert:
        await db.commit()
    inserted = len(to_insert)

    return UploadResult(inserted=inserted, skipped=skipped, warnings=warnings, errors=errors)


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
