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
