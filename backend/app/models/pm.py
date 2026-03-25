import uuid
from datetime import datetime, date

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class PM(Base):
    __tablename__ = "pm"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pipeline', 'onboarding', 'active', 'alumni', 'inactive')",
            name="ck_pm_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    strategy_type: Mapped[str | None] = mapped_column(String(50))
    style: Mapped[str | None] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pipeline"
    )
    max_capacity: Mapped[float | None] = mapped_column(Numeric(20, 2))
    current_aum: Mapped[float | None] = mapped_column(Numeric(20, 2), default=0)
    leverage_target: Mapped[float | None] = mapped_column(Numeric(10, 4))
    exposure_profile: Mapped[str | None] = mapped_column(String(50))
    trading_horizon: Mapped[str | None] = mapped_column(String(20))
    exchanges: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    gp_commitment: Mapped[float | None] = mapped_column(Numeric(20, 2))
    contact_name: Mapped[str | None] = mapped_column(String(100))
    contact_email: Mapped[str | None] = mapped_column(String(200))
    contact_telegram: Mapped[str | None] = mapped_column(String(100))
    nav_table_key: Mapped[str | None] = mapped_column(String(200))
    jurisdiction: Mapped[str | None] = mapped_column(String(100))
    entity_name: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now()
    )

    status_logs: Mapped[list["PMStatusLog"]] = relationship(
        back_populates="pm", cascade="all, delete-orphan"
    )
    return_source_configs: Mapped[list["ReturnSourceConfig"]] = relationship(
        back_populates="pm", cascade="all, delete-orphan"
    )
    daily_returns: Mapped[list["DailyReturn"]] = relationship(
        back_populates="pm", cascade="all, delete-orphan"
    )
    leverage_history: Mapped[list["PMLeverageHistory"]] = relationship(
        back_populates="pm", cascade="all, delete-orphan"
    )


class PMStatusLog(Base):
    __tablename__ = "pm_status_log"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    pm_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pm.id"), nullable=False
    )
    from_status: Mapped[str | None] = mapped_column(String(20))
    to_status: Mapped[str] = mapped_column(String(20), nullable=False)
    changed_by: Mapped[str | None] = mapped_column(String(100))
    changed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    reason: Mapped[str | None] = mapped_column(Text)

    pm: Mapped["PM"] = relationship(back_populates="status_logs")


class ReturnSourceConfig(Base):
    __tablename__ = "return_source_config"
    __table_args__ = (
        CheckConstraint(
            "source_type IN ('self_reported', 'internal_nav', 'exchange_api', 'gap_filled')",
            name="ck_return_source_config_source_type",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    pm_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pm.id"), nullable=False
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    source_type: Mapped[str] = mapped_column(String(20), nullable=False)
    source_ref: Mapped[str | None] = mapped_column(String(500))
    note: Mapped[str | None] = mapped_column(Text)

    pm: Mapped["PM"] = relationship(back_populates="return_source_configs")


class DailyReturn(Base):
    __tablename__ = "daily_return"
    __table_args__ = (
        UniqueConstraint("pm_id", "date", name="uq_daily_return_pm_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    pm_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pm.id"), nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    return_pct: Mapped[float] = mapped_column(Numeric(20, 10), nullable=False)
    source_type: Mapped[str | None] = mapped_column(String(20))
    is_verified: Mapped[bool | None] = mapped_column(Boolean, default=False)
    flag: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    pm: Mapped["PM"] = relationship(back_populates="daily_returns")


class PMLeverageHistory(Base):
    __tablename__ = "pm_leverage_history"
    __table_args__ = (
        UniqueConstraint("pm_id", "start_date", name="uq_leverage_history_pm_start"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    pm_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pm.id"), nullable=False
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    leverage: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    pm: Mapped["PM"] = relationship(back_populates="leverage_history")


class BenchmarkDaily(Base):
    __tablename__ = "benchmark_daily"

    date: Mapped[date] = mapped_column(Date, primary_key=True, nullable=False)
    symbol: Mapped[str] = mapped_column(String(20), primary_key=True, nullable=False)
    close_price: Mapped[float] = mapped_column(Numeric(30, 10), nullable=False)
    return_pct: Mapped[float | None] = mapped_column(Numeric(20, 10), nullable=True)
    source: Mapped[str | None] = mapped_column(String(50), default="binance")
