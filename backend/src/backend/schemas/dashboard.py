import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class DashboardRanked(BaseModel):
    name: str
    count: int
    total: Decimal


class DashboardMonth(BaseModel):
    month: date
    total: Decimal


class DashboardRecent(BaseModel):
    id: uuid.UUID
    merchant: str
    amount: Decimal
    currency: str
    purchased_at: date


class DashboardPublic(BaseModel):
    currency: str
    excluded_count: int
    this_month: Decimal
    last_month: Decimal
    this_month_count: int
    this_month_average: Decimal | None
    busiest_merchant: DashboardRanked | None
    monthly: list[DashboardMonth]
    top_merchants: list[DashboardRanked]
    top_products: list[DashboardRanked]
    recent: list[DashboardRecent]
