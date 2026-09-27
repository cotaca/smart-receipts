from backend.services.image_processing import MAX_DIMENSION
from backend.services.pdf import (
    MAX_PDF_PAGES,
    InvalidPdfError,
    open_pdf,
    pdf_text,
    render_pdf_pages,
    validate_pdf,
)
from tests.images import (
    make_multipage_pdf_bytes,
    make_pdf_bytes,
    make_scanned_pdf_bytes,
)


def test_pdf_text_returns_lines():
    pdf_bytes = make_pdf_bytes(["REWE Markt", "SUMME 12,34"])

    assert pdf_text(pdf_bytes) == "REWE Markt\nSUMME 12,34"


def test_pdf_text_empty_for_scanned_pdf():
    assert pdf_text(make_scanned_pdf_bytes()) == ""


def test_validate_pdf_passes_bytes_through_unchanged():
    pdf_bytes = make_pdf_bytes(["REWE"])

    processed = validate_pdf(pdf_bytes)

    assert processed.content == pdf_bytes
    assert processed.content_type == "application/pdf"
    assert processed.extension == ".pdf"


def test_render_pdf_pages_caps_longest_edge():
    for page in render_pdf_pages(make_scanned_pdf_bytes()):
        assert max(page.size) <= MAX_DIMENSION


def test_open_pdf_rejects_junk():
    try:
        open_pdf(b"not a pdf")
    except InvalidPdfError:
        return
    raise AssertionError("expected InvalidPdfError")


def test_open_pdf_rejects_too_many_pages():
    try:
        open_pdf(make_multipage_pdf_bytes(MAX_PDF_PAGES + 1))
    except InvalidPdfError:
        return
    raise AssertionError("expected InvalidPdfError")
