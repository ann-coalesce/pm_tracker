"""add_gap_filled_to_return_source_config_source_type

Revision ID: b4c83bdcc5ae
Revises: 47d299a2c292
Create Date: 2026-03-19 07:17:15.851883

"""
from typing import Sequence, Union

from alembic import op

revision: str = 'b4c83bdcc5ae'
down_revision: Union[str, None] = '47d299a2c292'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint('ck_return_source_config_source_type', 'return_source_config', type_='check')
    op.create_check_constraint(
        'ck_return_source_config_source_type',
        'return_source_config',
        "source_type IN ('self_reported', 'internal_nav', 'exchange_api', 'gap_filled')",
    )


def downgrade() -> None:
    op.drop_constraint('ck_return_source_config_source_type', 'return_source_config', type_='check')
    op.create_check_constraint(
        'ck_return_source_config_source_type',
        'return_source_config',
        "source_type IN ('self_reported', 'internal_nav', 'exchange_api')",
    )
