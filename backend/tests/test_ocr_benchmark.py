"""Benchmark against real receipt scans, run offline via checked-in fixtures.

The fixtures (tests/ocr_fixtures/*.json) are `{"lines": [[text, conf], ...]}`
dumps of Tesseract's actual output for 5 real receipts (not in the repo --
see backend/scripts/ocr_benchmark.py's docstring to regenerate them). No
Tesseract binary needed here, just parse_ocr_lines.

Core invariant, since merchant/amount/date feed display and money/date
fields and a wrong value is worse than a missing one: for every receipt,
merchant/amount/date are either the true value or None, and the returned
items' total_price values are a sub-multiset of the receipt's true item
totals (a Counter, not a set -- two items can legitimately share a total).
Missing a correct field is an acceptable trade-off of the confidence filter;
returning a wrong one is not. Each returned item is also internally
consistent: quantity * unit_price == total_price (within rounding).
"""

import json
from collections import Counter
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest

from backend.services.ocr import parse_ocr_lines

FIXTURES_DIR = Path(__file__).parent / "ocr_fixtures"

TRUTH = {
    "bon_edeka": {
        "merchant": {"EDEKA", "Neukauf Neudorf"},
        "amount": Decimal("3.64"),
        "date": date(2017, 1, 17),
        "low_quality": False,
        "items": ("1.18", "0.50", "0.99", "1.74", "-0.16", "-3.10", "2.49"),
    },
    "bon_rewe": {
        "merchant": {"REWE"},
        "amount": Decimal("4.98"),
        "date": date(2017, 4, 18),
        "low_quality": True,
        "items": ("9.95", "-4.97"),
    },
    "bon_rewe_bad_quality": {
        "merchant": {"REWE MARKT GMBH"},
        "amount": Decimal("24.18"),
        "date": date(2024, 7, 8),
        "low_quality": True,
        "items": (
            "2.69",
            "1.49",
            "2.29",
            "2.29",
            "1.99",
            "2.79",
            "1.99",
            "1.89",
            "1.99",
            "1.69",
            "1.79",
            "1.29",
        ),
    },
    "bon_rewe_scan": {
        "merchant": {"REWE"},
        "amount": Decimal("2.00"),
        "date": date(2020, 2, 7),
        "low_quality": False,
        "items": ("2.00",),
    },
    "bon_rossmann": {
        "merchant": {"ROSSMANN", "Mein Drogeriemarkt"},
        "amount": Decimal("14.41"),
        "date": date(2025, 9, 10),
        "low_quality": True,
        "items": (
            "2.90",
            "1.45",
            "0.29",
            "0.29",
            "7.96",
            "1.99",
            "1.99",
            "1.99",
            "5.56",
        ),
    },
}


def _load(name: str) -> list[tuple[str, float]]:
    data = json.loads((FIXTURES_DIR / f"{name}.json").read_text(encoding="utf-8"))
    return [(text, conf) for text, conf in data["lines"]]


@pytest.mark.parametrize("name", sorted(TRUTH))
def test_correct_or_empty_never_wrong(name):
    truth = TRUTH[name]
    extraction = parse_ocr_lines(_load(name))

    assert extraction.merchant is None or extraction.merchant in truth["merchant"]
    assert extraction.amount is None or extraction.amount == truth["amount"]
    assert extraction.purchased_at is None or extraction.purchased_at == truth["date"]


@pytest.mark.parametrize("name", sorted(TRUTH))
def test_item_totals_are_a_sub_multiset_of_the_true_totals(name):
    truth_counts = Counter(Decimal(x) for x in TRUTH[name]["items"])
    extraction = parse_ocr_lines(_load(name))

    result_counts = Counter(item.total_price for item in extraction.items)
    assert result_counts <= truth_counts


@pytest.mark.parametrize("name", sorted(TRUTH))
def test_items_are_internally_consistent(name):
    extraction = parse_ocr_lines(_load(name))
    for item in extraction.items:
        assert abs(item.quantity * item.unit_price - item.total_price) <= Decimal(
            "0.01"
        )


@pytest.mark.parametrize("name", sorted(TRUTH))
def test_low_quality_flag(name):
    extraction = parse_ocr_lines(_load(name))
    assert extraction.low_quality == TRUTH[name]["low_quality"]


def test_scan_amount_is_now_correct():
    # Previously read 1,87 (a VAT-table subtotal) instead of 2,00.
    extraction = parse_ocr_lines(_load("bon_rewe_scan"))
    assert extraction.amount == Decimal("2.00")


def test_edeka_amount_and_date_are_correct():
    extraction = parse_ocr_lines(_load("bon_edeka"))
    assert extraction.amount == Decimal("3.64")
    assert extraction.purchased_at == date(2017, 1, 17)


def test_rewe_merchant_is_no_longer_wrong():
    # The header line itself OCR'd too badly to survive the confidence
    # filter; a later, unrelated sentence used to become the "merchant"
    # instead (parse_receipt_text's has_header now prevents that).
    extraction = parse_ocr_lines(_load("bon_rewe"))
    assert extraction.merchant is None
