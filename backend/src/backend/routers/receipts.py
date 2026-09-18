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
from PIL.Image import DecompressionBombError
from sqlmodel import Session, select
from starlette.concurrency import run_in_threadpool

from backend.core.db import get_session
from backend.core.security import get_current_user
from backend.models.receipt import Receipt
from backend.models.user import User
from backend.schemas.receipt import ReceiptPublic, ReceiptUpdate
from backend.services.image_processing import ImageTooLargeError, preprocess_image
from backend.services.storage import StorageBackend, get_storage_backend

router = APIRouter(prefix="/receipts", tags=["receipts"])

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic"}
MAX_FILE_SIZE = 10 * 1024 * 1024


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
    )


def _get_owned_receipt(
    receipt_id: uuid.UUID, session: Session, current_user: User
) -> Receipt:
    receipt = session.get(Receipt, receipt_id)
    if receipt is None or receipt.user_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Receipt not found")
    return receipt


@router.post("", response_model=ReceiptPublic, status_code=status.HTTP_201_CREATED)
async def create_receipt(
    file: UploadFile = File(...),
    merchant: str = Form(...),
    amount: Decimal = Form(...),
    purchased_at: date = Form(...),
    currency: str = Form("EUR"),
    notes: str | None = Form(None),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    storage: StorageBackend = Depends(get_storage_backend),
) -> ReceiptPublic:
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unsupported image type")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File too large")

    # Pillow is CPU-bound and this is an async route -- decoding a 12 MP photo
    # inline would block the event loop for every other request.
    try:
        processed = await run_in_threadpool(preprocess_image, content)
    # OSError covers UnidentifiedImageError plus truncated/corrupt files that
    # pass the header check but fail to decode; the other two are Pillow's
    # and our own explicit "reject this input" signals.
    except (OSError, DecompressionBombError, ImageTooLargeError) as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Could not process image"
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
    )
    session.add(receipt)
    session.commit()
    session.refresh(receipt)
    return _to_public(receipt)


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
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(receipt, field, value)
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
