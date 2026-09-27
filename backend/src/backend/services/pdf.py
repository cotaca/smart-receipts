"""Handle uploaded PDF e-receipts: pass-through storage, text and OCR fallback.

Unlike preprocess_image, a PDF is never re-encoded -- rewriting it would risk
destroying its text layer, which is exactly what makes direct extraction
possible in the first place.
"""

import pypdfium2 as pdfium
from PIL import Image

from backend.services.image_processing import MAX_DIMENSION, ProcessedImage

# A receipt is 1-2 pages; caps CPU spent on text extraction and page rendering.
MAX_PDF_PAGES = 10

# 300 dpi is a good OCR resolution; scale = dpi / 72 (PDF's native unit).
RENDER_DPI = 300


class InvalidPdfError(Exception):
    """Raised for a corrupt, encrypted or too-large PDF upload."""


def open_pdf(content: bytes) -> pdfium.PdfDocument:
    try:
        document = pdfium.PdfDocument(content)
    except pdfium.PdfiumError as exc:
        raise InvalidPdfError("Could not open PDF") from exc

    if len(document) > MAX_PDF_PAGES:
        page_count = len(document)
        document.close()
        raise InvalidPdfError(
            f"PDF has {page_count} pages, exceeding the {MAX_PDF_PAGES} limit"
        )
    return document


def validate_pdf(content: bytes) -> ProcessedImage:
    """Check the upload is a usable PDF and pass its bytes through unchanged."""
    open_pdf(content).close()
    return ProcessedImage(
        content=content, content_type="application/pdf", extension=".pdf"
    )


def pdf_text(content: bytes) -> str:
    """Concatenate the text layer of every page, or "" if there is none."""
    document = open_pdf(content)
    try:
        lines = []
        for page in document:
            textpage = page.get_textpage()
            try:
                lines.append(textpage.get_text_range())
            finally:
                textpage.close()
            page.close()
        return "\n".join(lines).replace("\r\n", "\n")
    finally:
        document.close()


def render_pdf_pages(content: bytes) -> list[Image.Image]:
    """Render every page to a PIL image, capped at MAX_DIMENSION on the long edge."""
    document = open_pdf(content)
    try:
        scale = RENDER_DPI / 72
        images = []
        for page in document:
            bitmap = page.render(scale=scale)
            try:
                # to_pil() copies the pixel data into a standalone PIL image,
                # so it stays valid after the bitmap/page are closed below.
                image = bitmap.to_pil()
            finally:
                bitmap.close()
            page.close()
            if max(image.size) > MAX_DIMENSION:
                image.thumbnail(
                    (MAX_DIMENSION, MAX_DIMENSION), Image.Resampling.LANCZOS
                )
            images.append(image)
        return images
    finally:
        document.close()
