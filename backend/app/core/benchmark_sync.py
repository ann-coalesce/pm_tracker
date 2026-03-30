"""Fetch benchmark OHLCV from Binance public API and upsert into benchmark_daily."""
import logging
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import httpx
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.database import AsyncSessionLocal
from app.models.pm import BenchmarkDaily

logger = logging.getLogger(__name__)

BINANCE_KLINES_URL = "https://api.binance.com/api/v3/klines"
BACKFILL_DAYS = 1500  # ~4 years


async def fetch_klines(symbol: str, start_ms: int, end_ms: int) -> list[dict]:
    """Fetch daily klines from Binance, paginating 1000 rows at a time."""
    rows = []
    current_start = start_ms
    async with httpx.AsyncClient(timeout=30) as client:
        while current_start < end_ms:
            resp = await client.get(
                BINANCE_KLINES_URL,
                params={
                    "symbol": symbol,
                    "interval": "1d",
                    "startTime": current_start,
                    "endTime": end_ms,
                    "limit": 1000,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            if not data:
                break
            rows.extend(data)
            # Each row: [open_time, open, high, low, close, ...]
            last_open_time = data[-1][0]
            current_start = last_open_time + 86400000  # next day in ms
            if len(data) < 1000:
                break
    return rows


def _date_to_ms(d: date) -> int:
    return int(datetime(d.year, d.month, d.day, tzinfo=timezone.utc).timestamp() * 1000)


def _ms_to_date(ms: int) -> date:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).date()


async def sync_benchmark(symbol: str = "BTCUSDT", full: bool = False) -> dict:
    """
    Sync benchmark data for the given symbol.
    full=True: backfill from BACKFILL_DAYS ago.
    full=False: sync last 3 days only.
    """
    today = date.today()
    if full:
        start_date = today - timedelta(days=BACKFILL_DAYS)
    else:
        start_date = today - timedelta(days=3)

    start_ms = _date_to_ms(start_date)
    # end is tomorrow 00:00 UTC so we get today's closed candle
    end_ms = _date_to_ms(today + timedelta(days=1))

    logger.info("Fetching %s klines from %s (full=%s)", symbol, start_date, full)
    klines = await fetch_klines(symbol, start_ms, end_ms)

    if not klines:
        logger.warning("No klines returned for %s", symbol)
        return {"upserted": 0}

    # Build rows: close price per date
    price_by_date: dict[date, Decimal] = {}
    for row in klines:
        d = _ms_to_date(row[0])
        close = Decimal(str(row[4]))
        price_by_date[d] = close

    # Sort dates to compute returns
    sorted_dates = sorted(price_by_date)

    async with AsyncSessionLocal() as session:
        # For incremental: fetch the day before start to compute first return
        prev_close: Decimal | None = None
        if not full and sorted_dates:
            prev_date = sorted_dates[0] - timedelta(days=1)
            result = await session.execute(
                select(BenchmarkDaily).where(
                    BenchmarkDaily.symbol == symbol,
                    BenchmarkDaily.date == prev_date,
                )
            )
            prev_row = result.scalar_one_or_none()
            if prev_row:
                prev_close = Decimal(str(prev_row.close_price))

        rows_to_upsert = []
        for i, d in enumerate(sorted_dates):
            close = price_by_date[d]
            if i == 0:
                ret = float((close - prev_close) / prev_close) if prev_close else None
            else:
                prev = price_by_date[sorted_dates[i - 1]]
                ret = float((close - prev) / prev)
            rows_to_upsert.append({
                "date": d,
                "symbol": symbol,
                "close_price": float(close),
                "return_pct": ret,
                "source": "binance",
            })

        if rows_to_upsert:
            stmt = pg_insert(BenchmarkDaily).values(rows_to_upsert)
            stmt = stmt.on_conflict_do_update(
                index_elements=["date", "symbol"],
                set_={
                    "close_price": stmt.excluded.close_price,
                    "return_pct": stmt.excluded.return_pct,
                    "source": stmt.excluded.source,
                },
            )
            await session.execute(stmt)
            await session.commit()

    upserted = len(rows_to_upsert)
    logger.info("Upserted %d rows for %s", upserted, symbol)
    return {"upserted": upserted, "symbol": symbol}
