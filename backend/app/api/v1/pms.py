import uuid
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.metrics import calculate_equity_curve, calculate_metrics
from app.models.pm import DailyReturn, PM, PMStatusLog
from app.schemas.pm import PMCreate, PMResponse, PMStatusLogResponse, PMStatusUpdate, PMUpdate

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

    # fetch returns for all PMs in one query
    pm_ids = [pm.id for pm in pms]
    ret_result = await db.execute(
        select(DailyReturn.pm_id, DailyReturn.date, DailyReturn.return_pct)
        .where(DailyReturn.pm_id.in_(pm_ids))
        .order_by(DailyReturn.date.asc())
    )
    returns_by_pm: dict[uuid.UUID, list[tuple[date, Decimal]]] = {}
    for pm_id, d, r in ret_result.all():
        returns_by_pm.setdefault(pm_id, []).append((d, Decimal(str(r))))

    response = []
    for pm in pms:
        pm_data = PMResponse.model_validate(pm).model_dump()
        rets = returns_by_pm.get(pm.id, [])
        if len(rets) >= 2:
            curve = calculate_equity_curve(rets)
            pm_data["sparkline"] = [
                {"date": str(p["date"]), "nav": p["nav"]}
                for p in _sample_curve(curve)
            ]
            m = calculate_metrics(rets)
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
    pm = PM(**payload.model_dump())
    db.add(pm)
    await db.commit()
    await db.refresh(pm)
    return pm


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
