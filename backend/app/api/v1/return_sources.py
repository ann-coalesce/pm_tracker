import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.pm import PM, ReturnSourceConfig
from app.schemas.pm import ReturnSourceCreate, ReturnSourceResponse

router = APIRouter(prefix="/pms", tags=["return-sources"])


@router.get("/{pm_id}/return-sources", response_model=list[ReturnSourceResponse])
async def get_return_sources(pm_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    pm = await db.get(PM, pm_id)
    if pm is None:
        raise HTTPException(status_code=404, detail="PM not found")
    result = await db.execute(
        select(ReturnSourceConfig)
        .where(ReturnSourceConfig.pm_id == pm_id)
        .order_by(ReturnSourceConfig.start_date.asc())
    )
    return result.scalars().all()


@router.post("/{pm_id}/return-sources", response_model=ReturnSourceResponse, status_code=201)
async def add_return_source(
    pm_id: uuid.UUID,
    payload: ReturnSourceCreate,
    db: AsyncSession = Depends(get_db),
):
    pm = await db.get(PM, pm_id)
    if pm is None:
        raise HTTPException(status_code=404, detail="PM not found")

    # Close any currently open period
    open_result = await db.execute(
        select(ReturnSourceConfig)
        .where(ReturnSourceConfig.pm_id == pm_id)
        .where(ReturnSourceConfig.end_date == None)  # noqa: E711
    )
    for row in open_result.scalars().all():
        row.end_date = payload.start_date - timedelta(days=1)

    record = ReturnSourceConfig(
        pm_id=pm_id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        source_type=payload.source_type,
        source_ref=payload.source_ref,
        note=payload.note,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record
