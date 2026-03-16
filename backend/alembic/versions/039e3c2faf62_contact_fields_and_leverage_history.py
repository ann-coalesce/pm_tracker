"""contact_fields_and_leverage_history

Revision ID: 039e3c2faf62
Revises: 98b68aa20127
Create Date: 2026-03-16 07:31:53.867992

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '039e3c2faf62'
down_revision: Union[str, None] = '98b68aa20127'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'pm_leverage_history',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('pm_id', sa.UUID(), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=True),
        sa.Column('leverage', sa.Numeric(precision=10, scale=4), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['pm_id'], ['pm.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('pm_id', 'start_date', name='uq_leverage_history_pm_start'),
    )
    op.add_column('pm', sa.Column('contact_name', sa.String(length=100), nullable=True))
    op.add_column('pm', sa.Column('contact_email', sa.String(length=200), nullable=True))
    op.add_column('pm', sa.Column('contact_telegram', sa.String(length=100), nullable=True))
    op.drop_column('pm', 'contact_info')
    op.drop_column('pm', 'description')


def downgrade() -> None:
    op.add_column('pm', sa.Column('description', sa.Text(), nullable=True))
    op.add_column('pm', sa.Column('contact_info', sa.Text(), nullable=True))
    op.drop_column('pm', 'contact_telegram')
    op.drop_column('pm', 'contact_email')
    op.drop_column('pm', 'contact_name')
    op.drop_table('pm_leverage_history')
