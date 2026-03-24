"""add_jurisdiction_and_entity_name_to_pm

Revision ID: e3f9c12d8a47
Revises: b4c83bdcc5ae
Create Date: 2026-03-24 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e3f9c12d8a47"
down_revision: Union[str, None] = "b4c83bdcc5ae"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("pm", sa.Column("jurisdiction", sa.String(100), nullable=True))
    op.add_column("pm", sa.Column("entity_name", sa.String(200), nullable=True))


def downgrade() -> None:
    op.drop_column("pm", "entity_name")
    op.drop_column("pm", "jurisdiction")
