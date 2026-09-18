"""Prepare uploaded receipt images before they are stored.

Runs between upload and storage, independent of how the data is extracted
later: rotate by EXIF orientation, cap the longest edge, re-encode to JPEG.
Deliberately no deskew/contrast/binarization -- those are Tesseract accuracy
workarounds that an LLM-vision extractor would not benefit from.
"""

import io
from dataclasses import dataclass

import pillow_heif
from PIL import Image, ImageOps

# Lets Image.open() read HEIC/HEIF, so callers never special-case iPhone photos.
pillow_heif.register_heif_opener()

MAX_DIMENSION = 2000
JPEG_QUALITY = 85
# Well above any phone camera (iPhone tops out around 48 MP) but far below
# what Pillow's own DecompressionBombError threshold lets through -- a
# flat-color 12000x12000 PNG compresses under MAX_FILE_SIZE yet would decode
# into a ~430 MB RGB buffer before that error ever fires.
MAX_PIXELS = 50_000_000


class ImageTooLargeError(Exception):
    """Raised when an image's pixel count exceeds MAX_PIXELS.

    Deliberately not a Image.DecompressionBombError/OSError subclass: this is
    a "too big" rejection, not a "corrupt file" one, and callers may want to
    tell the two apart rather than have a broad except silently merge them.
    """


@dataclass(frozen=True)
class ProcessedImage:
    """Result of the pipeline: the bytes to store plus how to label them.

    Callers read content_type and extension from here instead of hardcoding
    them, so a future non-image branch (PDF e-receipts) can return the same
    shape without touching the upload route.
    """

    content: bytes
    content_type: str = "image/jpeg"
    extension: str = ".jpg"


def preprocess_image(content: bytes) -> ProcessedImage:
    """Rotate, downscale and re-encode an uploaded image.

    Raises OSError (covers PIL.UnidentifiedImageError and truncated/corrupt
    files), PIL.Image.DecompressionBombError, or ImageTooLargeError for input
    that is not a usable image; callers translate that into an HTTP error.
    Metadata is not carried over -- phone photos routinely embed GPS
    coordinates, which have no business being stored with a receipt.
    """
    image = Image.open(io.BytesIO(content))

    # Image.open() is lazy -- it reads the header without decoding pixels, so
    # this check runs before a malicious/huge image ever gets fully decoded.
    # Pillow's own DecompressionBombError only fires above 2x MAX_IMAGE_PIXELS;
    # a flat-color image comfortably clears MAX_FILE_SIZE well under that.
    width, height = image.size
    if width * height > MAX_PIXELS:
        raise ImageTooLargeError(
            f"Image has {width * height} pixels, exceeding the {MAX_PIXELS} limit"
        )

    # Must happen before saving: dropping EXIF also drops the orientation tag,
    # and exif_transpose clears it so viewers don't rotate a second time.
    image = ImageOps.exif_transpose(image)

    # JPEG has no alpha or palette mode. Transparency in a PNG is lost here,
    # which is irrelevant for photographed or scanned receipts.
    image = image.convert("RGB")

    # thumbnail() keeps the aspect ratio and never scales up, unlike resize().
    if max(image.size) > MAX_DIMENSION:
        image.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.Resampling.LANCZOS)

    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return ProcessedImage(content=buffer.getvalue())
