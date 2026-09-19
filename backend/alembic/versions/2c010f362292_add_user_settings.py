"""add user settings

Revision ID: 2c010f362292
Revises: beae83392571
Create Date: 2026-09-19 12:22:39.256046

"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "2c010f362292"
down_revision: str | Sequence[str] | None = "beae83392571"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # server_default backfills existing rows; the ORM-side Field(default=...)
    # only applies to rows created through SQLModel from here on.
    op.add_column(
        "users",
        sa.Column(
            "number_format",
            sqlmodel.sql.sqltypes.AutoString(),
            nullable=False,
            server_default="de-DE",
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "default_currency",
            sqlmodel.sql.sqltypes.AutoString(),
            nullable=False,
            server_default="EUR",
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("users", "default_currency")
    op.drop_column("users", "number_format")
