from fastapi import APIRouter

from app.api.v1.benchmarks import router as benchmarks_router
from app.api.v1.daily_returns import router as daily_returns_router
from app.api.v1.nav_sync import router as nav_sync_router
from app.api.v1.pms import router as pms_router
from app.api.v1.return_sources import router as return_sources_router

router = APIRouter()
router.include_router(pms_router)
router.include_router(daily_returns_router)
router.include_router(return_sources_router)
router.include_router(nav_sync_router)
router.include_router(benchmarks_router)
