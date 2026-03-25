"""create_benchmark_daily_table

Revision ID: f2a1c3e4d5b6
Revises: e3f9c12d8a47
Create Date: 2026-03-25 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f2a1c3e4d5b6"
down_revision: Union[str, None] = "e3f9c12d8a47"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "benchmark_daily",
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("symbol", sa.String(20), nullable=False),
        sa.Column("close_price", sa.Numeric(30, 10), nullable=False),
        sa.Column("return_pct", sa.Numeric(20, 10), nullable=True),
        sa.Column("source", sa.String(50), nullable=True, server_default="binance"),
        sa.PrimaryKeyConstraint("date", "symbol", name="pk_benchmark_daily"),
    )
    op.create_index("ix_benchmark_daily_symbol_date", "benchmark_daily", ["symbol", "date"])


def downgrade() -> None:
    op.drop_index("ix_benchmark_daily_symbol_date", table_name="benchmark_daily")
    op.drop_table("benchmark_daily")
