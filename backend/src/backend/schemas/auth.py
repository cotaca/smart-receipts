import unicodedata
import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, EmailStr

NumberFormat = Literal["de-DE", "en-US"]
Currency = Literal["EUR", "USD", "GBP", "CHF"]
Language = Literal["de", "en"]

BCRYPT_MAX_BYTES = 72
MIN_PASSWORD_LENGTH = 8


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


def _meets_password_policy(password: str) -> str:
    r"""Require length plus an upper, lower, digit and special character.

    Classes follow Unicode general categories so they match the JS regexes in
    frontend/src/lib/password.ts (\p{Lu}, \p{Ll}, \p{N}, [^\p{L}\p{N}]).
    Keep the two in sync.
    """
    categories = [unicodedata.category(c) for c in password]
    missing = [
        rule
        for rule, ok in {
            f"at least {MIN_PASSWORD_LENGTH} characters": len(password)
            >= MIN_PASSWORD_LENGTH,
            "an uppercase letter": "Lu" in categories,
            "a lowercase letter": "Ll" in categories,
            "a number": any(c[0] == "N" for c in categories),
            "a special character": any(c[0] not in "LN" for c in categories),
        }.items()
        if not ok
    ]
    if missing:
        raise ValueError("Password needs " + ", ".join(missing))
    return password


# Only applied where a password is *set*. Login and the current-password check
# must keep accepting longer input: accounts created before this limit existed
# have one, and rejecting it outright would lock them out instead of letting
# bcrypt compare the 72 bytes it actually stored. The same goes for the
# password policy: it is likewise skipped on login, current_password and
# account deletion, so older weak passwords keep working.
NewPassword = Annotated[
    str, AfterValidator(_within_bcrypt_limit), AfterValidator(_meets_password_policy)
]


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
    language: Language


class UserSettingsUpdate(BaseModel):
    number_format: NumberFormat | None = None
    default_currency: Currency | None = None
    language: Language | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: NewPassword


class DeleteAccountRequest(BaseModel):
    # Plain str, not NewPassword: older accounts can have a password longer
    # than 72 bytes and must still be able to delete their account.
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
