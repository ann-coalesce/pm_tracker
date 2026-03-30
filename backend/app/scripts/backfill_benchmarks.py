"""Backfill all benchmark symbols. Run from backend/ with venv active:
   python -m app.scripts.backfill_benchmarks
"""
import asyncio
import sys

from app.core.benchmark_sync import sync_benchmark, sync_spx, sync_cci30


async def main():
    print("Syncing BTC (full)...")
    r = await sync_benchmark(symbol="BTCUSDT", full=True)
    print(f"  {r}")

    print("Syncing ETH (full)...")
    r = await sync_benchmark(symbol="ETHUSDT", full=True)
    print(f"  {r}")

    print("Syncing SOL (full)...")
    r = await sync_benchmark(symbol="SOLUSDT", full=True)
    print(f"  {r}")

    print("Syncing SPX (full)...")
    r = await sync_spx(days=None)
    print(f"  {r}")

    print("Syncing CCI30 (full)...")
    r = await sync_cci30(days=None)
    print(f"  {r}")

    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
