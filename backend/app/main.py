from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.v1.router import router as v1_router
from app.core.benchmark_sync import sync_benchmark
from app.core.database import engine

scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    scheduler.add_job(
        sync_benchmark,
        "cron",
        hour=1,
        minute=0,
        kwargs={"symbol": "BTCUSDT", "full": False},
        id="benchmark_daily_sync",
        replace_existing=True,
    )
    scheduler.start()
    yield
    # shutdown
    scheduler.shutdown(wait=False)
    await engine.dispose()


app = FastAPI(title="PM Tracker API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(v1_router, prefix="/api/v1")


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/db-health")
async def db_health():
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        return {"status": "error", "database": "unreachable", "detail": str(e)}
