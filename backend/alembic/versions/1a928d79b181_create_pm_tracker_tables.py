"""create pm tracker tables

Revision ID: 1a928d79b181
Revises:
Create Date: 2026-03-10 07:23:53.102572

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1a928d79b181'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('pm',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('strategy_type', sa.String(length=50), nullable=True),
    sa.Column('style', sa.String(length=50), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('max_capacity', sa.Numeric(precision=20, scale=2), nullable=True),
    sa.Column('current_aum', sa.Numeric(precision=20, scale=2), nullable=True),
    sa.Column('leverage_target', sa.Numeric(precision=10, scale=4), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.CheckConstraint("status IN ('pipeline', 'onboarding', 'active', 'alumni', 'inactive')", name='ck_pm_status'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('daily_return',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('pm_id', sa.UUID(), nullable=False),
    sa.Column('date', sa.Date(), nullable=False),
    sa.Column('return_pct', sa.Numeric(precision=20, scale=10), nullable=False),
    sa.Column('source_type', sa.String(length=20), nullable=True),
    sa.Column('is_verified', sa.Boolean(), nullable=True),
    sa.Column('flag', sa.String(length=50), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.ForeignKeyConstraint(['pm_id'], ['pm.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('pm_id', 'date', name='uq_daily_return_pm_date')
    )
    op.create_table('pm_status_log',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('pm_id', sa.UUID(), nullable=False),
    sa.Column('from_status', sa.String(length=20), nullable=True),
    sa.Column('to_status', sa.String(length=20), nullable=False),
    sa.Column('changed_by', sa.String(length=100), nullable=True),
    sa.Column('changed_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.Column('reason', sa.Text(), nullable=True),
    sa.ForeignKeyConstraint(['pm_id'], ['pm.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('return_source_config',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('pm_id', sa.UUID(), nullable=False),
    sa.Column('start_date', sa.Date(), nullable=False),
    sa.Column('end_date', sa.Date(), nullable=True),
    sa.Column('source_type', sa.String(length=20), nullable=False),
    sa.Column('source_ref', sa.String(length=500), nullable=True),
    sa.Column('note', sa.Text(), nullable=True),
    sa.CheckConstraint("source_type IN ('self_reported', 'internal_nav', 'exchange_api')", name='ck_return_source_config_source_type'),
    sa.ForeignKeyConstraint(['pm_id'], ['pm.id'], ),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('return_source_config')
    op.drop_table('pm_status_log')
    op.drop_table('daily_return')
    op.drop_table('pm')
