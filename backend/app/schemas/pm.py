import uuid
from datetime import datetime, date
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, field_validator

VALID_STATUSES = {"pipeline", "onboarding", "active", "alumni", "inactive"}


class PMCreate(BaseModel):
    name: str
    status: str = "pipeline"
    strategy_type: Optional[str] = None
    style: Optional[str] = None
    max_capacity: Optional[Decimal] = None
    current_aum: Decimal = Decimal("0")
    leverage_target: Optional[Decimal] = None
    exposure_profile: Optional[str] = None
    trading_horizon: Optional[str] = None
    exchanges: Optional[list[str]] = None
    gp_commitment: Optional[Decimal] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_telegram: Optional[str] = None
    nav_table_key: Optional[str] = None
    initial_leverage: Optional[Decimal] = None


class PMUpdate(BaseModel):
    name: Optional[str] = None
    strategy_type: Optional[str] = None
    style: Optional[str] = None
    max_capacity: Optional[Decimal] = None
    current_aum: Optional[Decimal] = None
    leverage_target: Optional[Decimal] = None
    exposure_profile: Optional[str] = None
    trading_horizon: Optional[str] = None
    exchanges: Optional[list[str]] = None
    gp_commitment: Optional[Decimal] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_telegram: Optional[str] = None
    nav_table_key: Optional[str] = None


class PMStatusUpdate(BaseModel):
    to_status: str
    changed_by: str
    reason: Optional[str] = None

    @field_validator("to_status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in VALID_STATUSES:
            raise ValueError(f"to_status must be one of {sorted(VALID_STATUSES)}")
        return v


class PMResponse(BaseModel):
    id: uuid.UUID
    name: str
    strategy_type: Optional[str]
    style: Optional[str]
    status: str
    max_capacity: Optional[Decimal]
    current_aum: Optional[Decimal]
    leverage_target: Optional[Decimal]
    exposure_profile: Optional[str]
    trading_horizon: Optional[str]
    exchanges: Optional[list[str]]
    gp_commitment: Optional[Decimal]
    contact_name: Optional[str]
    contact_email: Optional[str]
    contact_telegram: Optional[str]
    nav_table_key: Optional[str]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class LeverageHistoryCreate(BaseModel):
    start_date: date
    end_date: Optional[date] = None
    leverage: Decimal


class LeverageHistoryResponse(BaseModel):
    id: uuid.UUID
    pm_id: uuid.UUID
    start_date: date
    end_date: Optional[date]
    leverage: Decimal
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


class ReturnSourceCreate(BaseModel):
    start_date: date
    end_date: Optional[date] = None
    source_type: str
    source_ref: Optional[str] = None
    note: Optional[str] = None

    @field_validator("source_type")
    @classmethod
    def validate_source_type(cls, v: str) -> str:
        valid = {"self_reported", "internal_nav", "exchange_api", "gap_filled"}
        if v not in valid:
            raise ValueError(f"source_type must be one of {sorted(valid)}")
        return v


class ReturnSourceResponse(BaseModel):
    id: uuid.UUID
    pm_id: uuid.UUID
    start_date: date
    end_date: Optional[date]
    source_type: str
    source_ref: Optional[str]
    note: Optional[str]

    model_config = {"from_attributes": True}


class PMStatusLogResponse(BaseModel):
    id: uuid.UUID
    pm_id: uuid.UUID
    from_status: Optional[str]
    to_status: str
    changed_by: Optional[str]
    changed_at: Optional[datetime]
    reason: Optional[str]

    model_config = {"from_attributes": True}
