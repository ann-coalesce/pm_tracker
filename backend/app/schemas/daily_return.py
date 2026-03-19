import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel


class DailyReturnCreate(BaseModel):
    date: date
    return_pct: Decimal
    source_type: str = "self_reported"


class DailyReturnResponse(BaseModel):
    id: uuid.UUID
    pm_id: uuid.UUID
    date: date
    return_pct: Decimal
    source_type: Optional[str]
    is_verified: Optional[bool]
    flag: Optional[str]
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


class UploadResult(BaseModel):
    inserted: int
    skipped: int
    warnings: list[str]
    errors: list[str]
    leverage_start_updated: bool = False
    leverage_start_date: Optional[str] = None
