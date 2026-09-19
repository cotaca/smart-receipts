import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, EmailStr

NumberFormat = Literal["de-DE", "en-US"]
Currency = Literal["EUR", "USD", "GBP", "CHF"]

BCRYPT_MAX_BYTES = 72


def _within_bcrypt_limit(password: str) -> str:
    """Reject passwords bcrypt would silently truncate.

    bcrypt hashes at most 72 bytes and drops the rest without complaining, so
    a longer passphrase would authenticate with any arbitrary tail -- the part
    the user thought made it strong. Bytes, not characters: umlauts and emoji
    cost more than one each.
    """
    if len(password.encode("utf-8")) > BCRYPT_MAX_BYTES:
        raise ValueError(f"Password must be at most {BCRYPT_MAX_BYTES} bytes")
    return password


# Only applied where a password is *set*. Login and the current-password check
# must keep accepting longer input: accounts created before this limit existed
# have one, and rejecting it outright would lock them out instead of letting
# bcrypt compare the 72 bytes it actually stored.
NewPassword = Annotated[str, AfterValidator(_within_bcrypt_limit)]


class RegisterRequest(BaseModel):
    email: EmailStr
    password: NewPassword


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserPublic(BaseModel):
    id: uuid.UUID
    email: EmailStr
    is_active: bool
    created_at: datetime
    number_format: NumberFormat
    default_currency: Currency


class UserSettingsUpdate(BaseModel):
    number_format: NumberFormat | None = None
    default_currency: Currency | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: NewPassword


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
