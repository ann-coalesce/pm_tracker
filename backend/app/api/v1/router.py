from fastapi import APIRouter

from app.api.v1.daily_returns import router as daily_returns_router
from app.api.v1.pms import router as pms_router

router = APIRouter()
router.include_router(pms_router)
router.include_router(daily_returns_router)
