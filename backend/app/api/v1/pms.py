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
from app.core.metrics import calculate_equity_curve, calculate_metrics
from app.models.pm import DailyReturn, PM, PMLeverageHistory, PMStatusLog
from app.schemas.pm import (
    LeverageHistoryCreate,
    LeverageHistoryResponse,
    PMCreate,
    PMResponse,
    PMStatusLogResponse,
    PMStatusUpdate,
    PMUpdate,
)

router = APIRouter(prefix="/pms", tags=["pms"])


def _sample_curve(curve: list[dict], max_points: int = 90) -> list[dict]:
    """Evenly sample up to max_points from the equity curve."""
    if len(curve) <= max_points:
        return curve
    step = len(curve) / max_points
    return [curve[int(i * step)] for i in range(max_points)]


@router.get("")
async def list_pms(
    status: Optional[str] = Query(None),
    strategy_type: Optional[str] = Query(None),
    include_sparkline: bool = Query(True),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(PM)
    if status is not None:
        stmt = stmt.where(PM.status == status)
    if strategy_type is not None:
        stmt = stmt.where(PM.strategy_type == strategy_type)
    result = await db.execute(stmt)
    pms = result.scalars().all()

    if not include_sparkline:
        return [PMResponse.model_validate(pm) for pm in pms]

    # fetch returns and leverage history for all PMs in batch queries
    pm_ids = [pm.id for pm in pms]
    ret_result = await db.execute(
        select(DailyReturn.pm_id, DailyReturn.date, DailyReturn.return_pct)
        .where(DailyReturn.pm_id.in_(pm_ids))
        .order_by(DailyReturn.date.asc())
    )
    returns_by_pm: dict[uuid.UUID, list[tuple[date, Decimal]]] = {}
    for pm_id, d, r in ret_result.all():
        returns_by_pm.setdefault(pm_id, []).append((d, Decimal(str(r))))

    lev_result = await db.execute(
        select(
            PMLeverageHistory.pm_id,
            PMLeverageHistory.start_date,
            PMLeverageHistory.end_date,
            PMLeverageHistory.leverage,
        ).where(PMLeverageHistory.pm_id.in_(pm_ids))
    )
    lev_by_pm: dict[uuid.UUID, list[dict]] = {}
    for pm_id, start, end, lev in lev_result.all():
        lev_by_pm.setdefault(pm_id, []).append(
            {"start_date": start, "end_date": end, "leverage": lev}
        )

    response = []
    for pm in pms:
        pm_data = PMResponse.model_validate(pm).model_dump()
        rets = returns_by_pm.get(pm.id, [])
        lev_hist = lev_by_pm.get(pm.id, [])
        if len(rets) >= 2:
            curve = calculate_equity_curve(rets, leverage_history=lev_hist)
            pm_data["sparkline"] = [
                {"date": str(p["date"]), "nav": p["nav"]}
                for p in _sample_curve(curve)
            ]
            m = calculate_metrics(rets, leverage_history=lev_hist)
            pm_data["metrics"] = {
                **m,
                "track_record_start": str(m["track_record_start"]),
                "track_record_end": str(m["track_record_end"]),
            }
        else:
            pm_data["sparkline"] = []
            pm_data["metrics"] = None
        response.append(pm_data)

    return response


@router.get("/{pm_id}", response_model=PMResponse)
async def get_pm(pm_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    pm = await db.get(PM, pm_id)
    if pm is None:
        raise HTTPException(status_code=404, detail="PM not found")
    return pm


@router.post("", response_model=PMResponse, status_code=201)
async def create_pm(payload: PMCreate, db: AsyncSession = Depends(get_db)):
    data = payload.model_dump(exclude={"initial_leverage"})
    pm = PM(**data)
    db.add(pm)
    await db.flush()  # get pm.id before commit

    initial_lev = payload.initial_leverage or payload.leverage_target or Decimal("1.0")
    db.add(PMLeverageHistory(
        pm_id=pm.id,
        start_date=date.today(),
        leverage=initial_lev,
    ))

    await db.commit()
    await db.refresh(pm)
    return pm


VALID_STATUSES = {"pipeline", "onboarding", "active", "alumni", "inactive"}

NUMERIC_FIELDS = {"leverage_target", "max_capacity", "current_aum", "gp_commitment"}


@router.post("/import-csv")
async def import_pms_csv(
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
):
    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    # Fetch all existing PM names (case-insensitive dedup)
    existing = await db.execute(select(func.lower(PM.name)))
    existing_names: set[str] = {row[0] for row in existing.all()}

    today = date.today()
    inserted = 0
    skipped = 0
    warnings: list[str] = []
    errors: list[str] = []

    reader = csv.DictReader(io.StringIO(text))
    for lineno, row in enumerate(reader, start=2):
        # Skip blank rows
        if not any(v.strip() for v in row.values()):
            continue

        name = (row.get("name") or "").strip()
        if not name:
            errors.append(f"Row {lineno}: name is empty — skipped")
            skipped += 1
            continue

        if name.lower() in existing_names:
            errors.append(f"Row {lineno}: PM '{name}' already exists — skipped")
            skipped += 1
            continue

        # Status
        status = (row.get("status") or "pipeline").strip()
        if status not in VALID_STATUSES:
            warnings.append(f"Row {lineno} ({name}): invalid status '{status}' → set to 'pipeline'")
            status = "pipeline"

        # Numeric fields
        def parse_num(field: str) -> Optional[Decimal]:
            raw = (row.get(field) or "").strip()
            if not raw:
                return None
            try:
                return Decimal(raw)
            except InvalidOperation:
                warnings.append(f"Row {lineno} ({name}): '{field}' value '{raw}' is not numeric → set to null")
                return None

        leverage_target = parse_num("leverage_target")
        max_capacity = parse_num("max_capacity")
        current_aum = parse_num("current_aum") or Decimal("0")
        gp_commitment = parse_num("gp_commitment")

        # Exchanges (comma-separated)
        raw_exchanges = (row.get("exchanges") or "").strip()
        exchanges = [e.strip() for e in raw_exchanges.split(",") if e.strip()] or None

        pm = PM(
            name=name,
            status=status,
            exposure_profile=(row.get("exposure_profile") or "").strip() or None,
            trading_horizon=(row.get("trading_horizon") or "").strip() or None,
            strategy_type=(row.get("strategy_type") or "").strip() or None,
            leverage_target=leverage_target,
            max_capacity=max_capacity,
            current_aum=current_aum,
            gp_commitment=gp_commitment,
            exchanges=exchanges,
            contact_name=(row.get("contact_name") or "").strip() or None,
            contact_email=(row.get("contact_email") or "").strip() or None,
            contact_telegram=(row.get("contact_telegram") or "").strip() or None,
            jurisdiction=(row.get("jurisdiction") or "").strip() or None,
            entity_name=(row.get("entity_name") or "").strip() or None,
        )
        db.add(pm)
        await db.flush()

        # First leverage history entry
        lev_value = leverage_target if leverage_target is not None else Decimal("1.0")
        db.add(PMLeverageHistory(
            pm_id=pm.id,
            start_date=today,
            end_date=None,
            leverage=lev_value,
        ))

        existing_names.add(name.lower())
        inserted += 1

    await db.commit()
    return {"inserted": inserted, "skipped": skipped, "warnings": warnings, "errors": errors}


@router.patch("/{pm_id}", response_model=PMResponse)
async def update_pm(pm_id: uuid.UUID, payload: PMUpdate, db: AsyncSession = Depends(get_db)):
    pm = await db.get(PM, pm_id)
    if pm is None:
        raise HTTPException(status_code=404, detail="PM not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(pm, field, value)
    await db.commit()
    await db.refresh(pm)
    return pm


@router.post("/{pm_id}/status", response_model=PMResponse)
async def update_pm_status(
    pm_id: uuid.UUID, payload: PMStatusUpdate, db: AsyncSession = Depends(get_db)
):
    pm = await db.get(PM, pm_id)
    if pm is None:
        raise HTTPException(status_code=404, detail="PM not found")

    log = PMStatusLog(
        pm_id=pm.id,
        from_status=pm.status,
        to_status=payload.to_status,
        changed_by=payload.changed_by,
        reason=payload.reason,
    )
    pm.status = payload.to_status
    db.add(log)
    await db.commit()
    await db.refresh(pm)
    return pm


@router.get("/{pm_id}/status-log", response_model=list[PMStatusLogResponse])
async def get_status_log(pm_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    pm = await db.get(PM, pm_id)
    if pm is None:
        raise HTTPException(status_code=404, detail="PM not found")
    stmt = (
        select(PMStatusLog)
        .where(PMStatusLog.pm_id == pm_id)
        .order_by(PMStatusLog.changed_at.desc())
    )
    result = await db.execute(stmt)
    return result.scalars().all()


async def get_leverage_for_date(pm_id: uuid.UUID, as_of: date, db: AsyncSession) -> Optional[Decimal]:
    """Return the leverage in effect for a PM on a given date."""
    stmt = (
        select(PMLeverageHistory.leverage)
        .where(PMLeverageHistory.pm_id == pm_id)
        .where(PMLeverageHistory.start_date <= as_of)
        .where(
            (PMLeverageHistory.end_date == None) | (PMLeverageHistory.end_date >= as_of)  # noqa: E711
        )
        .order_by(PMLeverageHistory.start_date.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


@router.get("/{pm_id}/leverage-history", response_model=list[LeverageHistoryResponse])
async def get_leverage_history(pm_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    pm = await db.get(PM, pm_id)
    if pm is None:
        raise HTTPException(status_code=404, detail="PM not found")
    stmt = (
        select(PMLeverageHistory)
        .where(PMLeverageHistory.pm_id == pm_id)
        .order_by(PMLeverageHistory.start_date.asc())
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/{pm_id}/leverage-history", response_model=LeverageHistoryResponse, status_code=201)
async def add_leverage_history(
    pm_id: uuid.UUID,
    payload: LeverageHistoryCreate,
    db: AsyncSession = Depends(get_db),
):
    from datetime import timedelta
    pm = await db.get(PM, pm_id)
    if pm is None:
        raise HTTPException(status_code=404, detail="PM not found")

    # Close any open period (end_date = null)
    open_result = await db.execute(
        select(PMLeverageHistory)
        .where(PMLeverageHistory.pm_id == pm_id)
        .where(PMLeverageHistory.end_date == None)  # noqa: E711
    )
    for open_row in open_result.scalars().all():
        open_row.end_date = payload.start_date - timedelta(days=1)

    # Insert new period
    lev = PMLeverageHistory(
        pm_id=pm_id,
        start_date=payload.start_date,
        end_date=None,
        leverage=payload.leverage,
    )
    db.add(lev)

    # Update pm.leverage_target to the new value
    pm.leverage_target = float(payload.leverage)

    await db.commit()
    await db.refresh(lev)
    return lev
