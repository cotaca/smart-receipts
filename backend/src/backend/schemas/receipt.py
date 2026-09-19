import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class ReceiptPublic(BaseModel):
    id: uuid.UUID
    original_filename: str
    content_type: str
    file_size: int
    merchant: str
    amount: Decimal
    currency: str
    purchased_at: date
    notes: str | None
    created_at: datetime
    updated_at: datetime
    image_url: str


class ReceiptUpdate(BaseModel):
    merchant: str | None = None
    amount: Decimal | None = None
    currency: str | None = None
    purchased_at: date | None = None
    notes: str | None = None


class ReceiptExtraction(BaseModel):
    """OCR guess for the create form -- any field may be None if unrecognized."""

    merchant: str | None
    amount: Decimal | None
    purchased_at: date | None
