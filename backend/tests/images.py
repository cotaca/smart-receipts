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
