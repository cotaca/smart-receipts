import uuid
from datetime import date
from decimal import Decimal

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
    status,
)
from fastapi.exceptions import RequestValidationError
from PIL.Image import DecompressionBombError
from pydantic import TypeAdapter, ValidationError
from sqlmodel import Session, select
from starlette.concurrency import run_in_threadpool

from backend.core.db import get_session
from backend.core.security import get_current_user
from backend.models.receipt import Receipt, ReceiptItem
from backend.models.user import User
from backend.schemas.receipt import (
    ReceiptExtraction,
    ReceiptLineItem,
    ReceiptPublic,
    ReceiptUpdate,
)
from backend.services.image_processing import (
    ImageTooLargeError,
    ProcessedImage,
    preprocess_image,
)
from backend.services.ocr import extract_pdf_data, extract_receipt_data
from backend.services.pdf import InvalidPdfError, validate_pdf
from backend.services.storage import StorageBackend, get_storage_backend

_ITEMS_ADAPTER = TypeAdapter(list[ReceiptLineItem])

router = APIRouter(prefix="/receipts", tags=["receipts"])

ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "application/pdf",
}
MAX_FILE_SIZE = 10 * 1024 * 1024
# Callers translate this together with OSError/DecompressionBombError/
# ImageTooLargeError into a 400 -- one tuple shared by create, extract and
# replace so a new failure mode can't be added to one and forgotten in another.
_PROCESSING_ERRORS = (
    OSError,
    DecompressionBombError,
    ImageTooLargeError,
    InvalidPdfError,
)


def _process_upload(content: bytes, content_type: str | None) -> ProcessedImage:
    """Branch on content type: a PDF passes through unchanged, else preprocess.

    Raises _PROCESSING_ERRORS for input that fails to decode -- a PDF sent
    with an image content type fails in Pillow, junk sent as a PDF fails in
    PDFium; the bytes decide, not the declared header.
    """
    if content_type == "application/pdf":
        return validate_pdf(content)
    return preprocess_image(content)


def _image_url(receipt_id: uuid.UUID) -> str:
    return f"/receipts/{receipt_id}/image"


def _to_public(receipt: Receipt) -> ReceiptPublic:
    return ReceiptPublic(
        id=receipt.id,
        original_filename=receipt.original_filename,
        content_type=receipt.content_type,
        file_size=receipt.file_size,
        merchant=receipt.merchant,
        amount=receipt.amount,
        currency=receipt.currency,
        purchased_at=receipt.purchased_at,
        notes=receipt.notes,
        created_at=receipt.created_at,
        updated_at=receipt.updated_at,
        image_url=_image_url(receipt.id),
        items=[
            ReceiptLineItem.model_validate(item, from_attributes=True)
            for item in receipt.items
        ],
    )


def _to_rows(items: list[ReceiptLineItem]) -> list[ReceiptItem]:
    return [
        ReceiptItem(position=i, **item.model_dump()) for i, item in enumerate(items)
    ]


def _get_owned_receipt(
    receipt_id: uuid.UUID, session: Session, current_user: User
) -> Receipt:
    receipt = session.get(Receipt, receipt_id)
    if receipt is None or receipt.user_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Receipt not found")
    return receipt


async def _read_upload(file: UploadFile) -> bytes:
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unsupported file type")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File too large")
    return content


@router.post("", response_model=ReceiptPublic, status_code=status.HTTP_201_CREATED)
async def create_receipt(
    file: UploadFile = File(...),
    merchant: str = Form(...),
    amount: Decimal = Form(...),
    purchased_at: date = Form(...),
    currency: str = Form("EUR"),
    notes: str | None = Form(None),
    items: str = Form("[]"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    storage: StorageBackend = Depends(get_storage_backend),
) -> ReceiptPublic:
    # Validate before touching storage, so an invalid items payload never
    # leaves an orphaned file behind.
    try:
        parsed_items = _ITEMS_ADAPTER.validate_json(items)
    except ValidationError as exc:
        # Prefix loc with ("body", "items") to match FastAPI's own shape for
        # every other field -- exc.errors() otherwise starts at the item
        # index (e.g. (0, "description")).
        errors = [
            {**error, "loc": ("body", "items", *error["loc"])} for error in exc.errors()
        ]
        raise RequestValidationError(errors) from exc

    content = await _read_upload(file)

    # Pillow/PDFium are CPU-bound and this is an async route -- decoding a
    # 12 MP photo or opening a PDF inline would block the event loop for
    # every other request.
    try:
        processed = await run_in_threadpool(_process_upload, content, file.content_type)
    except _PROCESSING_ERRORS as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Could not process file"
        ) from exc

    storage_key = f"{current_user.id}/{uuid.uuid4()}{processed.extension}"
    storage.save(storage_key, processed.content, processed.content_type)

    receipt = Receipt(
        user_id=current_user.id,
        storage_key=storage_key,
        original_filename=file.filename or "receipt",
        content_type=processed.content_type,
        file_size=len(processed.content),
        merchant=merchant,
        amount=amount,
        currency=currency,
        purchased_at=purchased_at,
        notes=notes,
        items=_to_rows(parsed_items),
    )
    session.add(receipt)
    session.commit()
    session.refresh(receipt)
    return _to_public(receipt)


@router.post("/extract", response_model=ReceiptExtraction)
async def extract_receipt(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
) -> ReceiptExtraction:
    """OCR a receipt image into form-fill suggestions -- persists nothing.

    No session/storage dependency: this is a read-only preview the frontend
    calls on file selection, before the user has confirmed any details.
    Declared as POST /receipts/extract, so it never collides with
    GET /receipts/{receipt_id} (different method, and there is no
    POST /receipts/{id}).
    """
    content = await _read_upload(file)
    extract = (
        extract_pdf_data
        if file.content_type == "application/pdf"
        else extract_receipt_data
    )
    try:
        return await run_in_threadpool(extract, content)
    # Same mapping as create_receipt. TesseractNotFoundError is deliberately
    # not caught here -- a missing binary is an environment problem, not bad
    # input, and should surface as a 500.
    except _PROCESSING_ERRORS as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Could not process file"
        ) from exc


@router.get("", response_model=list[ReceiptPublic])
def list_receipts(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[ReceiptPublic]:
    receipts = session.exec(
        select(Receipt)
        .where(Receipt.user_id == current_user.id)
        .order_by(Receipt.purchased_at.desc())
    ).all()
    return [_to_public(receipt) for receipt in receipts]


@router.get("/{receipt_id}", response_model=ReceiptPublic)
def get_receipt(
    receipt_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> ReceiptPublic:
    receipt = _get_owned_receipt(receipt_id, session, current_user)
    return _to_public(receipt)


@router.patch("/{receipt_id}", response_model=ReceiptPublic)
def update_receipt(
    receipt_id: uuid.UUID,
    body: ReceiptUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> ReceiptPublic:
    receipt = _get_owned_receipt(receipt_id, session, current_user)
    for field, value in body.model_dump(exclude_unset=True, exclude={"items"}).items():
        setattr(receipt, field, value)
    if body.items is not None:
        receipt.items = _to_rows(body.items)
    session.add(receipt)
    session.commit()
    session.refresh(receipt)
    return _to_public(receipt)


@router.delete("/{receipt_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_receipt(
    receipt_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    storage: StorageBackend = Depends(get_storage_backend),
) -> None:
    receipt = _get_owned_receipt(receipt_id, session, current_user)
    storage.delete(receipt.storage_key)
    session.delete(receipt)
    session.commit()


@router.put("/{receipt_id}/image", response_model=ReceiptPublic)
async def replace_receipt_image(
    receipt_id: uuid.UUID,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    storage: StorageBackend = Depends(get_storage_backend),
) -> ReceiptPublic:
    receipt = _get_owned_receipt(receipt_id, session, current_user)
    content = await _read_upload(file)

    try:
        processed = await run_in_threadpool(_process_upload, content, file.content_type)
    except _PROCESSING_ERRORS as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Could not process file"
        ) from exc

    old_storage_key = receipt.storage_key
    new_storage_key = f"{current_user.id}/{uuid.uuid4()}{processed.extension}"
    storage.save(new_storage_key, processed.content, processed.content_type)

    # Save new -> commit -> delete old, in that order: it's the only
    # permutation where storage_key never points at a missing file. If the
    # commit fails, the new file is orphaned (a leak, not a dangling
    # reference) -- clean it up and re-raise.
    try:
        receipt.storage_key = new_storage_key
        receipt.content_type = processed.content_type
        receipt.file_size = len(processed.content)
        receipt.original_filename = file.filename or "receipt"
        session.add(receipt)
        session.commit()
    except Exception:
        storage.delete(new_storage_key)
        raise
    session.refresh(receipt)

    # Deleting the old file is best-effort: the DB row is already correctly
    # committed to the new key, so a failure here must not turn a successful
    # replace into an error response. LocalStorageBackend.delete practically
    # never raises (unlink(missing_ok=True)), but StorageBackend is a
    # Protocol meant to be swapped for a remote backend later, and a remote
    # delete can fail.
    try:
        storage.delete(old_storage_key)
    except OSError:
        pass

    return _to_public(receipt)


@router.get("/{receipt_id}/image")
def get_receipt_image(
    receipt_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    storage: StorageBackend = Depends(get_storage_backend),
) -> Response:
    receipt = _get_owned_receipt(receipt_id, session, current_user)
    content = storage.read(receipt.storage_key)
    return Response(content=content, media_type=receipt.content_type)
