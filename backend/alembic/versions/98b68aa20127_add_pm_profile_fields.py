"""add pm profile fields

Revision ID: 98b68aa20127
Revises: 1a928d79b181
Create Date: 2026-03-13 03:41:40.582486

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '98b68aa20127'
down_revision: Union[str, None] = '1a928d79b181'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('pm', sa.Column('exposure_profile', sa.String(length=50), nullable=True))
    op.add_column('pm', sa.Column('trading_horizon', sa.String(length=20), nullable=True))
    op.add_column('pm', sa.Column('exchanges', postgresql.ARRAY(sa.Text()), nullable=True))
    op.add_column('pm', sa.Column('gp_commitment', sa.Numeric(precision=20, scale=2), nullable=True))
    op.add_column('pm', sa.Column('description', sa.Text(), nullable=True))
    op.add_column('pm', sa.Column('contact_info', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('pm', 'contact_info')
    op.drop_column('pm', 'description')
    op.drop_column('pm', 'gp_commitment')
    op.drop_column('pm', 'exchanges')
    op.drop_column('pm', 'trading_horizon')
    op.drop_column('pm', 'exposure_profile')
