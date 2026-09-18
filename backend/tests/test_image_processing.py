import io

import pytest
from PIL import Image, UnidentifiedImageError

from backend.services.image_processing import (
    MAX_DIMENSION,
    MAX_PIXELS,
    ImageTooLargeError,
    preprocess_image,
)
from tests.images import make_image_bytes


def _open(content: bytes) -> Image.Image:
    return Image.open(io.BytesIO(content))


def test_downscales_oversized_image():
    result = preprocess_image(make_image_bytes(size=(3000, 2000)))

    image = _open(result.content)
    assert max(image.size) <= MAX_DIMENSION
    # Aspect ratio survives the downscale: 3000x2000 in, 2000x1333 out.
    assert image.size == (2000, 1333)


def test_does_not_upscale_small_image():
    result = preprocess_image(make_image_bytes(size=(400, 300)))

    assert _open(result.content).size == (400, 300)


def test_re_encodes_to_jpeg():
    result = preprocess_image(make_image_bytes(fmt="PNG"))

    assert _open(result.content).format == "JPEG"
    assert result.content_type == "image/jpeg"
    assert result.extension == ".jpg"


def test_applies_exif_orientation():
    # Orientation 6 means "rotate 90° clockwise to display", so the stored
    # image must come out with its dimensions swapped.
    result = preprocess_image(make_image_bytes(size=(400, 200), orientation=6))

    assert _open(result.content).size == (200, 400)


def test_strips_metadata():
    # Phone photos embed GPS coordinates; they must not survive into storage.
    result = preprocess_image(make_image_bytes(orientation=6))

    assert not dict(_open(result.content).getexif())


def test_registers_heif_opener():
    # Importing the service must make HEIC readable for iPhone uploads.
    assert ".heic" in Image.registered_extensions()


def test_rejects_undecodable_bytes():
    # The router translates this into a 400; the service just lets it surface.
    with pytest.raises(UnidentifiedImageError):
        preprocess_image(b"not-a-real-image")


def test_rejects_truncated_image():
    # A valid JPEG header with the tail cut off decodes past Image.open()
    # (which only reads the header) but fails while reading pixel data --
    # this is what an aborted upload over a flaky connection looks like.
    content = make_image_bytes(size=(400, 300))
    truncated = content[: len(content) // 2]

    with pytest.raises(OSError):
        preprocess_image(truncated)


def test_rejects_image_above_pixel_limit():
    # A narrow, very tall image keeps the PNG tiny (solid color compresses to
    # almost nothing) while still exceeding MAX_PIXELS, and Image.open() is
    # lazy -- the pixel-count check below rejects it before any decoding, so
    # this test never actually allocates the ~240 MB an 80 MP RGB buffer
    # would take.
    width, height = 20_000, 4_000
    assert width * height > MAX_PIXELS
    content = make_image_bytes(size=(width, height), fmt="PNG")

    with pytest.raises(ImageTooLargeError):
        preprocess_image(content)
