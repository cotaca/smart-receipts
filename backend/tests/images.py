"""Build real image bytes for tests.

The upload path decodes with Pillow, so placeholder bytes like b"fake-jpeg"
are rejected. Generating images here keeps that honest without checking
binary fixtures into the repo; Image.new() costs microseconds.
"""

import io

from PIL import Image

EXIF_ORIENTATION_TAG = 0x0112


def make_image_bytes(
    size: tuple[int, int] = (100, 100),
    fmt: str = "JPEG",
    orientation: int | None = None,
) -> bytes:
    """Return encoded bytes of a solid-colour image of the given size.

    Passing an orientation embeds that EXIF tag, so tests can check that the
    upload path applies and then strips it.
    """
    image = Image.new("RGB", size, color="red")
    buffer = io.BytesIO()

    save_kwargs = {}
    if orientation is not None:
        exif = Image.Exif()
        exif[EXIF_ORIENTATION_TAG] = orientation
        save_kwargs["exif"] = exif

    image.save(buffer, format=fmt, **save_kwargs)
    return buffer.getvalue()


def make_pdf_bytes(lines: list[str]) -> bytes:
    """Build a minimal one-page PDF with a real text layer, one Tj per line.

    Handwritten instead of via a PDF library, so the test fixture doesn't
    depend on pypdfium2 (the thing under test) to produce its own input.
    """
    content_lines = "\n".join(
        f"BT /F1 12 Tf 10 {700 - i * 20} Td ({line}) Tj ET"
        for i, line in enumerate(lines)
    )
    content = content_lines.encode()
    pdf = (
        b"%PDF-1.4\n"
        b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
        b"3 0 obj<</Type/Page/Parent 2 0 R/Resources<</Font<</F1 5 0 R>>>>"
        b"/MediaBox[0 0 600 800]/Contents 4 0 R>>endobj\n"
        b"4 0 obj<</Length "
        + str(len(content)).encode()
        + b">>stream\n"
        + content
        + b"\nendstream endobj\n"
        b"5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n"
        b"trailer<</Root 1 0 R>>"
    )
    return pdf


def make_multipage_pdf_bytes(page_count: int) -> bytes:
    """A minimal PDF with `page_count` blank pages, for the page-limit test."""
    page_ids = list(range(3, 3 + page_count))
    objects = [
        b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n",
        b"2 0 obj<</Type/Pages/Kids["
        + b" ".join(f"{pid} 0 R".encode() for pid in page_ids)
        + f"]/Count {page_count}>>endobj\n".encode(),
    ]
    for pid in page_ids:
        objects.append(
            f"{pid} 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 100 100]>>endobj\n".encode()
        )
    return b"%PDF-1.4\n" + b"".join(objects) + b"trailer<</Root 1 0 R>>"


def make_scanned_pdf_bytes() -> bytes:
    """A PDF with a page image but no text layer, like a scanned receipt."""
    image = Image.new("RGB", (100, 100), color="white")
    buffer = io.BytesIO()
    image.save(buffer, format="PDF")
    return buffer.getvalue()


def fake_ocr_data(text: str, conf: float = 90.0) -> dict:
    """Build a pytesseract image_to_data-shaped dict from plain text.

    One word per whitespace token, one line (line_num) per text line, all at
    the same confidence -- enough for _ocr_lines to regroup, without a real
    Tesseract call.
    """
    data: dict[str, list] = {
        "text": [],
        "conf": [],
        "block_num": [],
        "par_num": [],
        "line_num": [],
    }
    for line_num, line in enumerate(text.split("\n")):
        for word in line.split():
            data["text"].append(word)
            data["conf"].append(conf)
            data["block_num"].append(0)
            data["par_num"].append(0)
            data["line_num"].append(line_num)
    return data
