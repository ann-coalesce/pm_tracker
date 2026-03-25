from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.benchmark_sync import sync_benchmark
from app.models.pm import BenchmarkDaily

router = APIRouter(prefix="/benchmarks", tags=["benchmarks"])


@router.get("/{symbol}")
async def get_benchmark(
    symbol: str,
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    symbol = symbol.upper()
    q = select(BenchmarkDaily).where(BenchmarkDaily.symbol == symbol)
    if start_date:
        q = q.where(BenchmarkDaily.date >= start_date)
    if end_date:
        q = q.where(BenchmarkDaily.date <= end_date)
    q = q.order_by(BenchmarkDaily.date)
    result = await db.execute(q)
    rows = result.scalars().all()
    return [
        {
            "date": r.date.isoformat(),
            "close_price": float(r.close_price),
            "return_pct": float(r.return_pct) if r.return_pct is not None else None,
        }
        for r in rows
    ]


@router.get("/{symbol}/equity-curve")
async def get_benchmark_equity_curve(
    symbol: str,
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    symbol = symbol.upper()
    q = select(BenchmarkDaily).where(BenchmarkDaily.symbol == symbol)
    if start_date:
        q = q.where(BenchmarkDaily.date >= start_date)
    if end_date:
        q = q.where(BenchmarkDaily.date <= end_date)
    q = q.order_by(BenchmarkDaily.date)
    result = await db.execute(q)
    rows = result.scalars().all()

    if not rows:
        return []

    # Build equity curve starting at 1.0
    curve = []
    nav = 1.0
    for r in rows:
        ret = float(r.return_pct) if r.return_pct is not None else 0.0
        nav = nav * (1 + ret)
        curve.append({"date": r.date.isoformat(), "nav": round(nav, 8)})
    return curve


@router.post("/{symbol}/sync")
async def trigger_benchmark_sync(symbol: str, full: bool = Query(False)):
    symbol = symbol.upper()
    result = await sync_benchmark(symbol=symbol, full=full)
    return result
