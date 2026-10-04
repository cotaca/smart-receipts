from datetime import date
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlmodel import Session, col, select

from backend.core.db import get_session
from backend.core.security import get_current_user
from backend.models.receipt import Receipt, ReceiptItem
from backend.models.user import User
from backend.schemas.dashboard import (
    DashboardMonth,
    DashboardPublic,
    DashboardRanked,
    DashboardRecent,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

Period = Literal["last-12-months", "this-year", "last-year"]
TOP_N = 5
RECENT_N = 4
# Month arithmetic needs a valid year before and after `today`'s.
MIN_YEAR, MAX_YEAR = 2, 9998


def _add_months(first: date, n: int) -> date:
    """`first` is a 1st of a month; returns the 1st of the month n later."""
    index = first.year * 12 + first.month - 1 + n
    return date(index // 12, index % 12 + 1, 1)


def _range(today: date, period: Period) -> tuple[date, date]:
    """Half-open [start, end), both 1sts of a month."""
    this_month = today.replace(day=1)
    if period == "last-12-months":
        return _add_months(this_month, -11), _add_months(this_month, 1)
    if period == "this-year":
        return date(today.year, 1, 1), _add_months(this_month, 1)
    return date(today.year - 1, 1, 1), date(today.year, 1, 1)


def _ranked(rows) -> list[DashboardRanked]:
    return [DashboardRanked(name=n, count=c, total=t) for n, c, t in rows]


@router.get("", response_model=DashboardPublic)
def get_dashboard(
    today: date,
    period: Period = "last-12-months",
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> DashboardPublic:
    if not MIN_YEAR <= today.year <= MAX_YEAR:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "today is out of range"
        )
    currency = current_user.default_currency
    mine = (
        Receipt.user_id == current_user.id,
        Receipt.currency == currency,
    )
    zero = Decimal("0.00")

    excluded_count = session.exec(
        select(func.count())
        .select_from(Receipt)
        .where(Receipt.user_id == current_user.id, Receipt.currency != currency)
    ).one()

    start, end = _range(today, period)
    this_start = today.replace(day=1)
    last_start = _add_months(this_start, -1)
    this_end = _add_months(this_start, 1)

    def month_total(lo: date, hi: date) -> tuple[Decimal, int]:
        total, count = session.exec(
            select(func.coalesce(func.sum(Receipt.amount), 0), func.count()).where(
                *mine, Receipt.purchased_at >= lo, Receipt.purchased_at < hi
            )
        ).one()
        return Decimal(total).quantize(zero), count

    this_month, this_month_count = month_total(this_start, this_end)
    last_month, _ = month_total(last_start, this_start)
    average = (
        (this_month / this_month_count).quantize(Decimal("0.01"))
        if this_month_count
        else None
    )

    merchant_key = func.lower(func.trim(Receipt.merchant))
    merchant_cols = (
        func.min(Receipt.merchant),
        func.count(),
        func.sum(Receipt.amount),
    )
    busiest = session.exec(
        select(*merchant_cols)
        .where(
            *mine, Receipt.purchased_at >= this_start, Receipt.purchased_at < this_end
        )
        .group_by(merchant_key)
        .order_by(
            func.count().desc(),
            func.sum(Receipt.amount).desc(),
            func.min(Receipt.merchant),
        )
        .limit(1)
    ).first()

    in_range = (Receipt.purchased_at >= start, Receipt.purchased_at < end)
    year = func.extract("year", Receipt.purchased_at)
    mon = func.extract("month", Receipt.purchased_at)
    by_month = {
        date(int(y), int(m), 1): Decimal(t)
        for y, m, t in session.exec(
            select(year, mon, func.sum(Receipt.amount))
            .where(*mine, *in_range)
            .group_by(year, mon)
        )
    }
    monthly = []
    month = start
    while month < end:
        monthly.append(DashboardMonth(month=month, total=by_month.get(month, zero)))
        month = _add_months(month, 1)

    top_merchants = session.exec(
        select(*merchant_cols)
        .where(*mine, *in_range)
        .group_by(merchant_key)
        .order_by(func.sum(Receipt.amount).desc(), func.min(Receipt.merchant))
        .limit(TOP_N)
    ).all()

    product_key = func.lower(func.trim(ReceiptItem.description))
    top_products = session.exec(
        select(
            func.min(ReceiptItem.description),
            func.count(),
            func.sum(ReceiptItem.total_price),
        )
        .join(Receipt, col(ReceiptItem.receipt_id) == col(Receipt.id))
        .where(*mine, *in_range)
        .group_by(product_key)
        .order_by(
            func.count().desc(),
            func.sum(ReceiptItem.total_price).desc(),
            func.min(ReceiptItem.description),
        )
        .limit(TOP_N)
    ).all()

    recent = session.exec(
        select(Receipt)
        .where(Receipt.user_id == current_user.id)
        .order_by(col(Receipt.purchased_at).desc(), col(Receipt.created_at).desc())
        .limit(RECENT_N)
    ).all()

    return DashboardPublic(
        currency=currency,
        excluded_count=excluded_count,
        this_month=this_month,
        last_month=last_month,
        this_month_count=this_month_count,
        this_month_average=average,
        busiest_merchant=_ranked([busiest])[0] if busiest else None,
        monthly=monthly,
        top_merchants=_ranked(top_merchants),
        top_products=_ranked(top_products),
        recent=[
            DashboardRecent(
                id=r.id,
                merchant=r.merchant,
                amount=r.amount,
                currency=r.currency,
                purchased_at=r.purchased_at,
            )
            for r in recent
        ],
    )
