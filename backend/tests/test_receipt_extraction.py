"""Tests for POST /receipts/extract -- mocks pytesseract, no binary needed.

httpx's ASGITransport runs with raise_app_exceptions=True, so an uncaught
exception in the route (e.g. TesseractNotFoundError) propagates out of the
test client instead of coming back as a 500 response. That path is therefore
exercised with pytest.raises rather than asserting on a response, and we
don't bother testing it here -- it's a one-line "not caught" behavior, not
logic worth a dedicated case.
"""

from unittest.mock import patch

from tests.images import (
    fake_ocr_data,
    make_image_bytes,
    make_pdf_bytes,
    make_scanned_pdf_bytes,
)
from tests.test_receipts import _register_and_auth

RECEIPT_BYTES = make_image_bytes()


async def test_extract_returns_parsed_fields(client):
    headers = await _register_and_auth(client, "owner@test.com")

    with patch(
        "backend.services.ocr.pytesseract.image_to_data",
        return_value=fake_ocr_data("REWE Markt\nSUMME 12,34\n15.01.2024"),
    ):
        response = await client.post(
            "/receipts/extract",
            headers=headers,
            files={"file": ("receipt.jpg", RECEIPT_BYTES, "image/jpeg")},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["merchant"] == "REWE Markt"
    assert body["amount"] == "12.34"
    assert body["purchased_at"] == "2024-01-15"
    assert body["items"] == []
    assert body["low_quality"] is False


async def test_extract_returns_items(client):
    headers = await _register_and_auth(client, "owner@test.com")

    with patch(
        "backend.services.ocr.pytesseract.image_to_data",
        return_value=fake_ocr_data("REWE Markt\nMilch 1,29\nSUMME 1,29"),
    ):
        response = await client.post(
            "/receipts/extract",
            headers=headers,
            files={"file": ("receipt.jpg", RECEIPT_BYTES, "image/jpeg")},
        )

    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 1
    assert items[0]["description"] == "Milch"


async def test_extract_flags_low_quality_images(client):
    headers = await _register_and_auth(client, "owner@test.com")

    with patch(
        "backend.services.ocr.pytesseract.image_to_data",
        return_value=fake_ocr_data("blurry text", conf=30.0),
    ):
        response = await client.post(
            "/receipts/extract",
            headers=headers,
            files={"file": ("receipt.jpg", RECEIPT_BYTES, "image/jpeg")},
        )

    assert response.status_code == 200
    assert response.json()["low_quality"] is True


async def test_extract_persists_nothing(client, storage_backend):
    headers = await _register_and_auth(client, "owner@test.com")

    with (
        patch(
            "backend.services.ocr.pytesseract.image_to_data",
            return_value=fake_ocr_data(""),
        ),
        patch.object(storage_backend, "save") as save_mock,
    ):
        response = await client.post(
            "/receipts/extract",
            headers=headers,
            files={"file": ("receipt.jpg", RECEIPT_BYTES, "image/jpeg")},
        )

    assert response.status_code == 200
    save_mock.assert_not_called()

    list_response = await client.get("/receipts", headers=headers)
    assert list_response.json() == []


async def test_extract_rejects_missing_token(client):
    response = await client.post(
        "/receipts/extract",
        files={"file": ("receipt.jpg", RECEIPT_BYTES, "image/jpeg")},
    )
    assert response.status_code == 401


async def test_extract_rejects_unsupported_content_type(client):
    headers = await _register_and_auth(client, "owner@test.com")

    response = await client.post(
        "/receipts/extract",
        headers=headers,
        files={"file": ("receipt.txt", b"not an image", "text/plain")},
    )

    assert response.status_code == 400


async def test_extract_pdf_with_text_layer_skips_ocr(client):
    headers = await _register_and_auth(client, "owner@test.com")
    pdf_bytes = make_pdf_bytes(["REWE Markt", "SUMME 12,34", "15.01.2024"])

    with patch("backend.services.ocr.pytesseract.image_to_data") as image_to_data:
        response = await client.post(
            "/receipts/extract",
            headers=headers,
            files={"file": ("bon.pdf", pdf_bytes, "application/pdf")},
        )

    assert response.status_code == 200
    image_to_data.assert_not_called()
    body = response.json()
    assert body["merchant"] == "REWE Markt"
    assert body["amount"] == "12.34"
    assert body["purchased_at"] == "2024-01-15"


async def test_extract_scanned_pdf_falls_back_to_ocr(client):
    headers = await _register_and_auth(client, "owner@test.com")
    pdf_bytes = make_scanned_pdf_bytes()

    with patch(
        "backend.services.ocr.pytesseract.image_to_data",
        return_value=fake_ocr_data("REWE Markt\nSUMME 12,34"),
    ) as image_to_data:
        response = await client.post(
            "/receipts/extract",
            headers=headers,
            files={"file": ("bon.pdf", pdf_bytes, "application/pdf")},
        )

    assert response.status_code == 200
    image_to_data.assert_called()
    body = response.json()
    assert body["merchant"] == "REWE Markt"
    assert body["amount"] == "12.34"


async def test_extract_rejects_junk_pdf(client):
    headers = await _register_and_auth(client, "owner@test.com")

    response = await client.post(
        "/receipts/extract",
        headers=headers,
        files={"file": ("bon.pdf", b"not a pdf", "application/pdf")},
    )

    assert response.status_code == 400
