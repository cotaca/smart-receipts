import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class ReceiptLineItem(BaseModel):
    """One line item, in and out. No id: PATCH always replaces the list."""

    description: str = Field(min_length=1, max_length=200)
    quantity: Decimal = Field(gt=0, max_digits=10, decimal_places=3)
    # May be negative (deposit return, discount line).
    unit_price: Decimal = Field(max_digits=10, decimal_places=2)
    total_price: Decimal = Field(max_digits=10, decimal_places=2)


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
    items: list[ReceiptLineItem]


class ReceiptUpdate(BaseModel):
    merchant: str | None = None
    amount: Decimal | None = None
    currency: str | None = None
    purchased_at: date | None = None
    notes: str | None = None
    items: list[ReceiptLineItem] | None = None


class ReceiptExtraction(BaseModel):
    """OCR guess for the create form -- any field may be None if unrecognized."""

    merchant: str | None
    amount: Decimal | None
    purchased_at: date | None
    items: list[ReceiptLineItem] = []
    low_quality: bool = False
