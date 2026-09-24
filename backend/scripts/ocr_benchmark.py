"""Manual OCR benchmark against real receipt photos (not in the repo).

Tesseract isn't installed on the host, so this runs inside the backend
container, which has it. From the repo root (Git Bash, prefix docker commands
with MSYS_NO_PATHCONV=1 on Windows to avoid path mangling):

    docker cp data/. smart-receipts-backend-1:/tmp/bons
    docker compose exec backend python scripts/ocr_benchmark.py /tmp/bons --dump tests/ocr_fixtures

`backend/` is mounted at /app inside the container, so --dump writes straight
into the repo. Prints merchant/amount/date/low_quality/item count per image;
--dump additionally writes `<name>.json` = {"lines": [[text, conf], ...]} for
each image, used as CI fixtures in test_ocr_benchmark.py (no Tesseract there).
"""

import argparse
import io
import json
import sys
from pathlib import Path

import pytesseract
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from backend.services.image_processing import preprocess_image
from backend.services.ocr import OCR_CONFIG, _ocr_lines, parse_ocr_lines


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("image_dir", type=Path)
    parser.add_argument("--dump", type=Path, default=None)
    args = parser.parse_args()

    if args.dump:
        args.dump.mkdir(parents=True, exist_ok=True)

    for path in sorted(args.image_dir.iterdir()):
        content = path.read_bytes()
        processed = preprocess_image(content)
        image = Image.open(io.BytesIO(processed.content))
        data = pytesseract.image_to_data(
            image, lang="deu", config=OCR_CONFIG, output_type=pytesseract.Output.DICT
        )
        lines = _ocr_lines(data)
        extraction = parse_ocr_lines(lines)

        print(
            f"{path.name}: merchant={extraction.merchant!r} amount={extraction.amount} "
            f"date={extraction.purchased_at} low_quality={extraction.low_quality} "
            f"items={len(extraction.items)}"
        )

        if args.dump:
            fixture_name = path.stem + ".json"
            (args.dump / fixture_name).write_text(
                json.dumps({"lines": [[text, conf] for text, conf in lines]}, indent=2)
            )


if __name__ == "__main__":
    main()
