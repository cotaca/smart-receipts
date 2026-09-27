import logging

import jwt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlmodel import Session, delete, select

from backend.core.config import settings
from backend.core.db import get_session
from backend.core.security import (
    TokenType,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    hash_password,
    verify_password,
)
from backend.models.receipt import Receipt
from backend.models.user import User
from backend.schemas.auth import (
    ChangePasswordRequest,
    DeleteAccountRequest,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserPublic,
    UserSettingsUpdate,
)
from backend.services.storage import StorageBackend, get_storage_backend

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])
REFRESH_COOKIE_NAME = "refresh_token"


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        REFRESH_COOKIE_NAME,
        token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
    )


def _clear_refresh_cookie(response: Response) -> None:
    # Attributes must mirror _set_refresh_cookie: a browser matches a cookie
    # deletion by name *and* attributes, so a mismatched one is ignored and
    # the original cookie survives.
    response.delete_cookie(
        REFRESH_COOKIE_NAME,
        httponly=True,
        secure=True,
        samesite="lax",
    )


@router.post(
    "/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED
)
def register(
    body: RegisterRequest, response: Response, session: Session = Depends(get_session)
):
    if session.exec(select(User).where(User.email == body.email)).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    user = User(email=body.email, hashed_password=hash_password(body.password))
    session.add(user)
    session.commit()
    session.refresh(user)

    _set_refresh_cookie(response, create_refresh_token(user.id))
    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/login", response_model=TokenResponse)
def login(
    body: LoginRequest, response: Response, session: Session = Depends(get_session)
):
    user = session.exec(select(User).where(User.email == body.email)).first()
    if user is None or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")

    _set_refresh_cookie(response, create_refresh_token(user.id))
    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/refresh", response_model=TokenResponse)
def refresh(
    refresh_token: str | None = Cookie(default=None),
    session: Session = Depends(get_session),
):
    if refresh_token is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing refresh token")
    try:
        user_id = decode_token(refresh_token, TokenType.REFRESH)
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Invalid or expired refresh token"
        ) from exc

    user = session.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Invalid or expired refresh token"
        )
    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response):
    _clear_refresh_cookie(response)


@router.get("/me", response_model=UserPublic)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserPublic)
def update_me(
    body: UserSettingsUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(current_user, field, value)
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return current_user


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    body: ChangePasswordRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Change the current user's password.

    Existing access/refresh tokens stay valid, refresh
    tokens are deliberately stateless with no revocation table, so there is
    nothing to invalidate here. A stolen token survives a password change
    until it expires; that's a pre-existing, documented trade-off, not
    something this endpoint should try to fix.
    """
    if not verify_password(body.current_password, current_user.hashed_password):
        # 400, not 401: the bearer token is valid and the request is
        # authenticated -- the wrong value is inside the body. Keeping this a
        # 401 would make a future global 401->logout interceptor sign the
        # user out on every typo.
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Incorrect current password")

    current_user.hashed_password = hash_password(body.new_password)
    session.add(current_user)
    session.commit()


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    body: DeleteAccountRequest,
    response: Response,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    storage: StorageBackend = Depends(get_storage_backend),
):
    """Permanently delete the current user, their receipts and images.

    Hard delete, no undo. The DB row is the source of truth, so it goes
    first: receipts (there's no `ondelete` on `receipts.user_id`, so this is
    explicit) then the user, then commit. Only after that do we best-effort
    delete the image files -- an orphaned file beats a live account with
    broken images if a delete fails.
    """
    if not verify_password(body.password, current_user.hashed_password):
        # 400, not 401: same reasoning as change-password -- the bearer
        # token is valid, the wrong value is inside the body.
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Incorrect password")

    storage_keys = session.exec(
        select(Receipt.storage_key).where(Receipt.user_id == current_user.id)
    ).all()
    session.exec(delete(Receipt).where(Receipt.user_id == current_user.id))
    session.delete(current_user)
    session.commit()

    for key in storage_keys:
        try:
            storage.delete(key)
        except Exception:
            logger.exception(
                "Failed to delete receipt image %s after account deletion", key
            )

    _clear_refresh_cookie(response)
