import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.pm import PM, PMStatusLog
from app.schemas.pm import PMCreate, PMResponse, PMStatusLogResponse, PMStatusUpdate, PMUpdate

router = APIRouter(prefix="/pms", tags=["pms"])


@router.get("", response_model=list[PMResponse])
async def list_pms(
    status: Optional[str] = Query(None),
    strategy_type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(PM)
    if status is not None:
        stmt = stmt.where(PM.status == status)
    if strategy_type is not None:
        stmt = stmt.where(PM.strategy_type == strategy_type)
    result = await db.execute(stmt)
    return result.scalars().all()


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
