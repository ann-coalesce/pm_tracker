"""add_nav_table_key_to_pm

Revision ID: 47d299a2c292
Revises: 039e3c2faf62
Create Date: 2026-03-17 09:51:59.396211

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '47d299a2c292'
down_revision: Union[str, None] = '039e3c2faf62'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('pm', sa.Column('nav_table_key', sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column('pm', 'nav_table_key')
