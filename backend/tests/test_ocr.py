"""Unit tests for the pure text-parsing heuristics -- no Tesseract needed."""

from datetime import date
from decimal import Decimal
from unittest.mock import patch

from backend.services.ocr import (
    LINE_MIN_CONFIDENCE,
    LOW_QUALITY_CONFIDENCE,
    OCR_CONFIG,
    _ocr_lines,
    extract_receipt_data,
    parse_ocr_lines,
    parse_receipt_text,
)
from tests.images import fake_ocr_data, make_image_bytes


def test_parses_all_fields_from_a_typical_receipt():
    text = "REWE Markt\nBrot 2,50\nSUMME 12,34\n15.01.2024"

    result = parse_receipt_text(text)

    assert result.merchant == "REWE Markt"
    assert result.amount == Decimal("12.34")
    assert result.purchased_at == date(2024, 1, 15)


def test_amount_without_thousands_separator():
    result = parse_receipt_text("SUMME 1234,56")
    assert result.amount == Decimal("1234.56")


def test_amount_with_thousands_separator():
    result = parse_receipt_text("SUMME 1.234,56")
    assert result.amount == Decimal("1234.56")


def test_final_total_wins_over_zwischensumme():
    text = "ZWISCHENSUMME 10,00\nSUMME 12,34"

    result = parse_receipt_text(text)

    assert result.amount == Decimal("12.34")


def test_no_total_keyword_gives_no_amount():
    result = parse_receipt_text("Brot 2,50\nMilch 1,20")
    assert result.amount is None


def test_empty_text_gives_no_fields():
    result = parse_receipt_text("")

    assert result.merchant is None
    assert result.amount is None
    assert result.purchased_at is None


def test_two_digit_year():
    result = parse_receipt_text("15.01.24")
    assert result.purchased_at == date(2024, 1, 15)


def test_invalid_date_is_skipped_for_a_later_valid_one():
    result = parse_receipt_text("99.99.2024 15.01.2024")
    assert result.purchased_at == date(2024, 1, 15)


def test_amount_on_the_line_after_the_keyword():
    # Kassendrucker sometimes wrap the total onto the next line.
    result = parse_receipt_text("SUMME\n12,34")
    assert result.amount == Decimal("12.34")


def test_betrag_keyword_does_not_shadow_the_real_total():
    # "Rabattbetrag" matched TOTAL_KEYWORDS via the "BETRAG" substring and,
    # as the later line, won under the "last match wins" rule -- returning
    # the discount instead of the total. Regression test for that.
    text = "REWE Markt GmbH\n12.03.2026 14:32\nMilch 1,29\nSUMME EUR 20,00\nGeg. BAR 50,00\nRabattbetrag 2,00"

    result = parse_receipt_text(text)

    assert result.amount == Decimal("20.00")


def test_items_rewe_style_quantity_line_after_item():
    # REWE prints the item total first, then a quantity/unit-price line.
    text = "REWE Markt\nMilch 2,58 A\n2 Stk x 1,29\nSUMME 2,58"

    result = parse_receipt_text(text)

    assert len(result.items) == 1
    item = result.items[0]
    assert item.description == "Milch"
    assert item.quantity == Decimal(2)
    assert item.unit_price == Decimal("1.29")
    assert item.total_price == Decimal("2.58")


def test_items_lidl_style_quantity_line_before_item():
    # Lidl prints the quantity/unit-price line first, then the item.
    text = "Lidl\n2 Stk x 1,29\nMilch 2,58\nSUMME 2,58"

    result = parse_receipt_text(text)

    assert len(result.items) == 1
    item = result.items[0]
    assert item.description == "Milch"
    assert item.quantity == Decimal(2)
    assert item.unit_price == Decimal("1.29")


def test_items_inline_quantity_in_description():
    text = "REWE Markt\nMilch 2 x 1,29 2,58\nSUMME 2,58"

    result = parse_receipt_text(text)

    assert len(result.items) == 1
    item = result.items[0]
    assert item.description == "Milch"
    assert item.quantity == Decimal(2)
    assert item.unit_price == Decimal("1.29")
    assert item.total_price == Decimal("2.58")


def test_items_weighed_goods_rounded():
    text = "Lidl\n0,523 kg x 2,99 EUR/kg\nGurke 1,56\nSUMME 1,56"

    result = parse_receipt_text(text)

    assert len(result.items) == 1
    item = result.items[0]
    assert item.quantity == Decimal("0.523")
    assert item.unit_price == Decimal("2.99")
    assert item.total_price == Decimal("1.56")


def test_items_negative_deposit_return():
    text = "Shop\nPfandrueckgabe -0,25\nSUMME 4,75"

    result = parse_receipt_text(text)

    assert len(result.items) == 1
    item = result.items[0]
    assert item.description == "Pfandrueckgabe"
    assert item.total_price == Decimal("-0.25")
    assert item.unit_price == Decimal("-0.25")


def test_items_tax_class_and_star_stripped_from_description():
    text = "Shop\nMilch 1,29 A\nBrot 2,00*\nSUMME 3,29"

    result = parse_receipt_text(text)

    descriptions = [item.description for item in result.items]
    assert descriptions == ["Milch", "Brot"]


def test_items_zero_inline_quantity_is_skipped_not_raised():
    # "0 x 1,29" parses to quantity=0, which fails ReceiptLineItem's gt=0 --
    # must be skipped, not raise ValidationError out of parse_receipt_text.
    result = parse_receipt_text("Shop\nMilch 0 x 1,29 1,29\nSUMME 1,29")
    assert result.items == []


def test_items_overlong_description_is_skipped_not_raised():
    # A 250-char description fails ReceiptLineItem's max_length=200 -- must be
    # skipped, not raise ValidationError out of parse_receipt_text.
    text = f"Shop\n{'A' * 250} 1,29\nSUMME 1,29"
    result = parse_receipt_text(text)
    assert result.items == []


def test_no_total_line_gives_no_items():
    result = parse_receipt_text("Shop\nMilch 1,29\nBrot 2,00")
    assert result.items == []


def test_items_lines_after_total_are_not_items():
    text = "Shop\nMilch 1,29\nSUMME 1,29\nGeg. BAR 50,00"

    result = parse_receipt_text(text)

    assert len(result.items) == 1
    assert result.items[0].description == "Milch"


def test_items_unmatched_quantity_line_is_ignored():
    text = "Shop\nMilch 1,29\n3 Stk x 5,00\nSUMME 1,29"

    result = parse_receipt_text(text)

    assert len(result.items) == 1
    item = result.items[0]
    assert item.quantity == Decimal(1)
    assert item.unit_price == Decimal("1.29")


def test_has_header_false_gives_no_merchant():
    # The confidence filter dropped the real header line -- whatever ends up
    # as lines[0] is unrelated body text, not a header, and must not be
    # reported as the merchant.
    text = "Sie erhalten 502 PAYBACK Punkte\nMilch 1,29\nSUMME 1,29"
    result = parse_receipt_text(text, has_header=False)
    assert result.merchant is None


def test_has_header_false_parses_the_first_line_as_an_item():
    text = "Milch 1,29\nBrot 2,00\nSUMME 3,29"
    result = parse_receipt_text(text, has_header=False)
    descriptions = [item.description for item in result.items]
    assert descriptions == ["Milch", "Brot"]


def test_item_containing_gesamt_does_not_truncate_the_list_before_summe():
    # An item line matching FALLBACK_TOTAL_KEYWORDS ("GESAMT") must not end
    # the item list early when a real SUMME line exists further down --
    # _items_end only considers fallback keywords if no primary one exists.
    text = "Shop\nGESAMT Sparpaket 1,29\nBrot 2,00\nSUMME 3,29"
    result = parse_receipt_text(text)
    descriptions = [item.description for item in result.items]
    assert descriptions == ["GESAMT Sparpaket", "Brot"]


def test_extract_receipt_data_passes_psm_config_to_tesseract():
    # Without an explicit PSM, Tesseract's default layout detection can split
    # a receipt into two columns (labels, then amounts), which breaks
    # _find_amount's line-based heuristics. Guards against someone dropping
    # the config and all other tests staying green while the feature breaks.
    content = make_image_bytes()

    with patch(
        "backend.services.ocr.pytesseract.image_to_data",
        return_value=fake_ocr_data(""),
    ) as mock_ocr:
        extract_receipt_data(content)

    mock_ocr.assert_called_once()
    assert mock_ocr.call_args.kwargs["config"] == OCR_CONFIG


def test_summe_beats_a_later_gesamtbetrag():
    text = "REWE Markt\nMilch 1,29\nSUMME EUR 20,00\nGesamtbetrag 1,87"
    assert parse_receipt_text(text).amount == Decimal("20.00")


def test_gesamtbetrag_works_as_a_fallback_alone():
    text = "Shop\nMilch 1,29\nGesamtbetrag 1,29"
    assert parse_receipt_text(text).amount == Decimal("1.29")


def test_iso_date():
    result = parse_receipt_text("Start: 2025-09-10 08:49")
    assert result.purchased_at == date(2025, 9, 10)


def test_iso_date_without_trailing_boundary():
    # Rossmann OCR glues the date to the following time with no separator.
    result = parse_receipt_text("Start: 2025-09-10108:49:08402:00")
    assert result.purchased_at == date(2025, 9, 10)


def test_items_tax_class_two_letters():
    text = "Shop\nMilch 1,74 BW\nSUMME 1,74"
    result = parse_receipt_text(text)
    assert result.items[0].description == "Milch"


def test_items_tax_class_x_prefix_no_space():
    text = "Shop\nPfand 0,50xC\nSUMME 0,50"
    result = parse_receipt_text(text)
    assert result.items[0].description == "Pfand"


def test_items_tax_class_star_prefix_no_space():
    text = "Shop\nPfand 0,50*C\nSUMME 0,50"
    result = parse_receipt_text(text)
    assert result.items[0].description == "Pfand"


def test_items_tax_class_with_trailing_star():
    text = "Shop\nMilch 2,00 B *\nSUMME 2,00"
    result = parse_receipt_text(text)
    assert result.items[0].description == "Milch"


def test_ocr_lines_groups_words_by_line_and_ignores_negative_conf():
    data = {
        "text": ["REWE", "Markt", "", "SUMME", "12,34"],
        "conf": [95.0, 90.0, -1.0, 80.0, 85.0],
        "block_num": [1, 1, 1, 1, 1],
        "par_num": [1, 1, 1, 1, 1],
        "line_num": [1, 1, 1, 2, 2],
    }

    lines = _ocr_lines(data)

    assert lines == [("REWE Markt", 92.5), ("SUMME 12,34", 82.5)]


def test_parse_ocr_lines_drops_a_line_below_the_threshold():
    lines = [
        ("REWE Markt", 90.0),
        ("Milch 1,29", LINE_MIN_CONFIDENCE - 1),
        ("SUMME 1,29", 90.0),
    ]

    result = parse_ocr_lines(lines)

    assert result.items == []  # the item line was dropped before parsing
    assert result.amount == Decimal("1.29")


def test_parse_ocr_lines_flags_low_quality_below_the_threshold():
    lines = [("REWE Markt", LOW_QUALITY_CONFIDENCE - 1)]
    assert parse_ocr_lines(lines).low_quality is True


def test_parse_ocr_lines_not_low_quality_at_or_above_the_threshold():
    lines = [("REWE Markt", LOW_QUALITY_CONFIDENCE)]
    assert parse_ocr_lines(lines).low_quality is False


def test_parse_ocr_lines_empty_input_is_low_quality():
    assert parse_ocr_lines([]).low_quality is True


def test_parse_ocr_lines_no_merchant_when_the_header_line_is_dropped():
    # The header itself scored too low and was dropped; a later, unrelated
    # line survives and must not become the reported merchant.
    lines = [
        ("Garbled Header Text", LINE_MIN_CONFIDENCE - 1),
        ("Some unrelated sentence", LINE_MIN_CONFIDENCE + 10),
        ("SUMME 1,29", LINE_MIN_CONFIDENCE + 10),
    ]
    result = parse_ocr_lines(lines)
    assert result.merchant is None


def test_parse_ocr_lines_merchant_kept_when_the_header_line_survives():
    lines = [
        ("REWE Markt", LINE_MIN_CONFIDENCE + 10),
        ("SUMME 1,29", LINE_MIN_CONFIDENCE + 10),
    ]
    result = parse_ocr_lines(lines)
    assert result.merchant == "REWE Markt"
