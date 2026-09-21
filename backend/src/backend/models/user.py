import uuid
from datetime import UTC, datetime

from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    email: str = Field(unique=True, index=True)
    hashed_password: str
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    # Locale string, not a separator enum -- the frontend hands this straight
    # to Intl.NumberFormat(number_format), no mapping table on either side.
    number_format: str = Field(default="de-DE")
    default_currency: str = Field(default="EUR")
    # UI language, independent of number_format -- see ARCHITECTURE.md.
    language: str = Field(default="de")
