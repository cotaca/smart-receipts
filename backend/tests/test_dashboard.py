import json
from decimal import Decimal

from tests.images import make_image_bytes

RECEIPT_BYTES = make_image_bytes()
TODAY = "2026-03-15"


async def _register_and_auth(client, email: str, password: str = "Very-secure-pass1"):
    response = await client.post(
        "/auth/register", json={"email": email, "password": password}
    )
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _create_receipt(client, headers, **overrides):
    data = {
        "merchant": "Rewe",
        "amount": "10.00",
        "purchased_at": "2026-03-10",
        "currency": "EUR",
        **overrides,
    }
    files = {"file": ("receipt.jpg", RECEIPT_BYTES, "image/jpeg")}
    response = await client.post("/receipts", headers=headers, data=data, files=files)
    assert response.status_code == 201
    return response


def _items(*descriptions: str, price: str = "1.00") -> str:
    return json.dumps(
        [
            {
                "description": d,
                "quantity": "1",
                "unit_price": price,
                "total_price": price,
            }
            for d in descriptions
        ]
    )


async def _get(client, headers, period="last-12-months", today=TODAY):
    response = await client.get(
        "/dashboard", headers=headers, params={"today": today, "period": period}
    )
    assert response.status_code == 200
    return response.json()


async def test_requires_auth(client):
    response = await client.get("/dashboard", params={"today": TODAY})
    assert response.status_code == 401


async def test_missing_today_or_unknown_period_is_422(client):
    headers = await _register_and_auth(client, "a@test.com")
    assert (await client.get("/dashboard", headers=headers)).status_code == 422
    for params in (
        {"today": TODAY, "period": "forever"},
        {"today": "not-a-date"},
        {"today": "0001-06-15"},
        {"today": "9999-12-31"},
    ):
        response = await client.get("/dashboard", headers=headers, params=params)
        assert response.status_code == 422


async def test_other_users_receipts_are_never_counted(client):
    mine = await _register_and_auth(client, "me@test.com")
    other = await _register_and_auth(client, "other@test.com")
    await _create_receipt(client, other, amount="99.00", items=_items("Milch"))

    body = await _get(client, mine)

    assert Decimal(body["this_month"]) == 0
    assert body["excluded_count"] == 0
    assert body["recent"] == []
    assert body["top_merchants"] == []
    assert body["top_products"] == []


async def test_other_currency_is_excluded_but_counted_and_shown_in_recent(client):
    headers = await _register_and_auth(client, "a@test.com")
    await _create_receipt(client, headers, amount="10.00")
    await _create_receipt(
        client, headers, amount="50.00", currency="USD", items=_items("Milch")
    )

    body = await _get(client, headers)

    assert body["currency"] == "EUR"
    assert Decimal(body["this_month"]) == 10
    assert body["this_month_count"] == 1
    assert body["excluded_count"] == 1
    assert body["top_products"] == []
    assert {r["currency"] for r in body["recent"]} == {"EUR", "USD"}


async def test_month_boundary(client):
    headers = await _register_and_auth(client, "a@test.com")
    await _create_receipt(client, headers, amount="5.00", purchased_at="2026-02-28")
    await _create_receipt(client, headers, amount="7.00", purchased_at="2026-03-01")

    body = await _get(client, headers)

    assert Decimal(body["last_month"]) == 5
    assert Decimal(body["this_month"]) == 7


async def test_monthly_last_12_months_crosses_year_boundary(client):
    headers = await _register_and_auth(client, "a@test.com")
    await _create_receipt(client, headers, amount="4.00", purchased_at="2025-04-30")
    await _create_receipt(client, headers, amount="3.00", purchased_at="2025-03-31")

    months = (await _get(client, headers))["monthly"]

    assert len(months) == 12
    assert months[0]["month"] == "2025-04-01"
    assert months[-1]["month"] == "2026-03-01"
    totals = {m["month"]: Decimal(m["total"]) for m in months}
    assert totals["2025-04-01"] == 4
    assert totals["2025-12-01"] == 0
    assert sum(totals.values()) == 4  # March 2025 is outside the range


async def test_monthly_this_year_and_last_year(client):
    headers = await _register_and_auth(client, "a@test.com")
    await _create_receipt(client, headers, amount="2.00", purchased_at="2025-12-31")
    await _create_receipt(client, headers, amount="6.00", purchased_at="2026-01-01")

    this_year = (await _get(client, headers, "this-year"))["monthly"]
    assert [m["month"] for m in this_year] == [
        "2026-01-01",
        "2026-02-01",
        "2026-03-01",
    ]
    assert Decimal(this_year[0]["total"]) == 6

    last_year = (await _get(client, headers, "last-year"))["monthly"]
    assert len(last_year) == 12
    assert last_year[0]["month"] == "2025-01-01"
    assert last_year[-1]["month"] == "2025-12-01"
    assert Decimal(last_year[-1]["total"]) == 2


async def test_average_is_null_when_empty_and_rounded_otherwise(client):
    headers = await _register_and_auth(client, "a@test.com")
    empty = await _get(client, headers)
    assert empty["this_month_average"] is None
    assert empty["busiest_merchant"] is None

    await _create_receipt(client, headers, amount="10.00")
    await _create_receipt(client, headers, amount="10.00")
    await _create_receipt(client, headers, amount="10.01")

    body = await _get(client, headers)
    assert body["this_month_count"] == 3
    assert body["this_month_average"] == "10.00"


async def test_busiest_merchant_groups_case_and_whitespace(client):
    headers = await _register_and_auth(client, "a@test.com")
    await _create_receipt(client, headers, merchant="REWE ", amount="5.00")
    await _create_receipt(client, headers, merchant="rewe", amount="6.00")
    await _create_receipt(client, headers, merchant="Aldi", amount="100.00")

    busiest = (await _get(client, headers))["busiest_merchant"]

    assert busiest["count"] == 2
    assert Decimal(busiest["total"]) == 11
    assert busiest["name"].strip().lower() == "rewe"


async def test_busiest_merchant_tie_goes_to_higher_total(client):
    headers = await _register_and_auth(client, "a@test.com")
    await _create_receipt(client, headers, merchant="Aldi", amount="5.00")
    await _create_receipt(client, headers, merchant="Lidl", amount="9.00")

    assert (await _get(client, headers))["busiest_merchant"]["name"] == "Lidl"


async def test_top_merchants_ordered_by_total_and_limited_to_five(client):
    headers = await _register_and_auth(client, "a@test.com")
    for i in range(6):
        await _create_receipt(
            client, headers, merchant=f"Shop{i}", amount=f"{i + 1}.00"
        )

    top = (await _get(client, headers))["top_merchants"]

    assert [m["name"] for m in top] == ["Shop5", "Shop4", "Shop3", "Shop2", "Shop1"]


async def test_top_products_group_order_and_period(client):
    headers = await _register_and_auth(client, "a@test.com")
    await _create_receipt(client, headers, items=_items("Milch", " MILCH", "Brot"))
    await _create_receipt(
        client, headers, items=_items("milch", "Butter", price="3.00")
    )
    await _create_receipt(
        client, headers, purchased_at="2024-01-01", items=_items("Brot", "Brot")
    )

    top = (await _get(client, headers))["top_products"]

    assert [(p["name"].strip().lower(), p["count"]) for p in top] == [
        ("milch", 3),
        ("butter", 1),
        ("brot", 1),
    ]
    assert Decimal(top[0]["total"]) == 5
    # tie on count 1: higher total first (Butter 3.00 before Brot 1.00)
    assert Decimal(top[1]["total"]) == 3


async def test_recent_limited_to_four_newest_first(client):
    headers = await _register_and_auth(client, "a@test.com")
    for day in range(1, 7):
        await _create_receipt(
            client, headers, purchased_at=f"2026-01-0{day}", merchant=f"M{day}"
        )

    recent = (await _get(client, headers))["recent"]

    assert [r["merchant"] for r in recent] == ["M6", "M5", "M4", "M3"]


async def test_january_rolls_back_to_previous_december(client):
    headers = await _register_and_auth(client, "a@test.com")
    await _create_receipt(client, headers, amount="5.00", purchased_at="2025-12-31")
    await _create_receipt(client, headers, amount="7.00", purchased_at="2026-01-02")

    body = await _get(client, headers, "this-year", today="2026-01-15")

    assert Decimal(body["last_month"]) == 5
    assert Decimal(body["this_month"]) == 7
    assert [m["month"] for m in body["monthly"]] == ["2026-01-01"]


async def test_december_last_12_months_is_the_calendar_year(client):
    headers = await _register_and_auth(client, "a@test.com")

    months = (await _get(client, headers, today="2026-12-31"))["monthly"]

    assert months[0]["month"] == "2026-01-01"
    assert months[-1]["month"] == "2026-12-01"
    assert len(months) == 12


async def test_busiest_merchant_only_counts_this_month(client):
    headers = await _register_and_auth(client, "a@test.com")
    for _ in range(3):
        await _create_receipt(
            client, headers, merchant="Aldi", purchased_at="2026-01-10"
        )
    await _create_receipt(client, headers, merchant="Lidl", amount="1.00")

    assert (await _get(client, headers))["busiest_merchant"]["name"] == "Lidl"


async def test_empty_month_totals_have_two_decimals(client):
    headers = await _register_and_auth(client, "a@test.com")

    body = await _get(client, headers)

    assert body["this_month"] == "0.00"
    assert body["last_month"] == "0.00"
