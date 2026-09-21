"""add user language

Revision ID: ed701f156517
Revises: 2c010f362292
Create Date: 2026-09-21 18:16:11.404696

"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "ed701f156517"
down_revision: str | Sequence[str] | None = "2c010f362292"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # server_default backfills existing rows; the ORM-side Field(default=...)
    # only applies to rows created through SQLModel from here on.
    op.add_column(
        "users",
        sa.Column(
            "language",
            sqlmodel.sql.sqltypes.AutoString(),
            nullable=False,
            server_default="de",
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("users", "language")
