from sqlmodel import select

from backend.models.user import User

EMAIL = "user@test.com"
PASSWORD = "very-secure-password"


async def _register(client, email: str = EMAIL, password: str = PASSWORD):
    return await client.post(
        "/auth/register", json={"email": email, "password": password}
    )


async def test_register_creates_user_and_returns_tokens(client, db_session):
    response = await _register(client)

    assert response.status_code == 201
    body = response.json()
    assert body["token_type"] == "bearer"
    assert "access_token" in body
    assert "refresh_token" in client.cookies

    user = db_session.exec(select(User).where(User.email == EMAIL)).first()
    assert user is not None
    assert user.hashed_password != PASSWORD


async def test_register_duplicate_email_returns_409(client):
    await _register(client)
    response = await _register(client)

    assert response.status_code == 409


async def test_login_with_correct_password_returns_tokens(client):
    await _register(client)
    response = await client.post(
        "/auth/login", json={"email": EMAIL, "password": PASSWORD}
    )

    assert response.status_code == 200
    assert "access_token" in response.json()


async def test_login_with_wrong_password_returns_401(client):
    await _register(client)
    response = await client.post(
        "/auth/login", json={"email": EMAIL, "password": "wrong-password"}
    )

    assert response.status_code == 401


async def test_login_unknown_email_returns_401(client):
    response = await client.post(
        "/auth/login", json={"email": "nobody@test.com", "password": PASSWORD}
    )

    assert response.status_code == 401


async def test_me_without_token_returns_401(client):
    response = await client.get("/auth/me")

    assert response.status_code == 401


async def test_me_with_valid_token_returns_user(client):
    register_response = await _register(client)
    access_token = register_response.json()["access_token"]

    response = await client.get(
        "/auth/me", headers={"Authorization": f"Bearer {access_token}"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["email"] == EMAIL
    assert "hashed_password" not in body


async def test_me_with_invalid_token_returns_401(client):
    response = await client.get(
        "/auth/me", headers={"Authorization": "Bearer not-a-real-token"}
    )

    assert response.status_code == 401


async def test_refresh_with_valid_cookie_returns_new_access_token(client):
    await _register(client)

    response = await client.post("/auth/refresh")
    assert response.status_code == 200
    new_access_token = response.json()["access_token"]

    me_response = await client.get(
        "/auth/me", headers={"Authorization": f"Bearer {new_access_token}"}
    )
    assert me_response.status_code == 200
    assert me_response.json()["email"] == EMAIL


async def test_refresh_without_cookie_returns_401(client):
    response = await client.post("/auth/refresh")

    assert response.status_code == 401


async def test_refresh_rejects_access_token_used_as_refresh_token(client):
    register_response = await _register(client)
    access_token = register_response.json()["access_token"]

    client.cookies.set("refresh_token", access_token)
    response = await client.post("/auth/refresh")

    assert response.status_code == 401


async def test_logout_clears_refresh_cookie(client):
    await _register(client)
    assert "refresh_token" in client.cookies

    logout_response = await client.post("/auth/logout")
    assert logout_response.status_code == 204

    refresh_response = await client.post("/auth/refresh")
    assert refresh_response.status_code == 401


async def _auth_headers(client) -> dict[str, str]:
    register_response = await _register(client)
    return {"Authorization": f"Bearer {register_response.json()['access_token']}"}


async def test_me_returns_default_settings(client):
    headers = await _auth_headers(client)

    response = await client.get("/auth/me", headers=headers)

    body = response.json()
    assert body["number_format"] == "de-DE"
    assert body["default_currency"] == "EUR"
    assert body["language"] == "de"


async def test_patch_me_updates_number_format(client):
    headers = await _auth_headers(client)

    response = await client.patch(
        "/auth/me", json={"number_format": "en-US"}, headers=headers
    )

    assert response.status_code == 200
    assert response.json()["number_format"] == "en-US"


async def test_patch_me_updates_language(client):
    headers = await _auth_headers(client)

    response = await client.patch("/auth/me", json={"language": "en"}, headers=headers)

    assert response.status_code == 200
    assert response.json()["language"] == "en"


async def test_patch_me_invalid_language_returns_422(client):
    headers = await _auth_headers(client)

    response = await client.patch("/auth/me", json={"language": "fr"}, headers=headers)

    assert response.status_code == 422


async def test_patch_me_partial_update_leaves_other_field_untouched(client):
    headers = await _auth_headers(client)
    await client.patch("/auth/me", json={"default_currency": "USD"}, headers=headers)

    response = await client.patch(
        "/auth/me", json={"number_format": "en-US"}, headers=headers
    )

    body = response.json()
    assert body["number_format"] == "en-US"
    assert body["default_currency"] == "USD"


async def test_patch_me_invalid_number_format_returns_422(client):
    headers = await _auth_headers(client)

    response = await client.patch(
        "/auth/me", json={"number_format": "fr-FR"}, headers=headers
    )

    assert response.status_code == 422


async def test_patch_me_invalid_currency_returns_422(client):
    headers = await _auth_headers(client)

    response = await client.patch(
        "/auth/me", json={"default_currency": "JPY"}, headers=headers
    )

    assert response.status_code == 422


async def test_patch_me_without_token_returns_401(client):
    response = await client.patch("/auth/me", json={"number_format": "en-US"})

    assert response.status_code == 401


async def test_change_password_succeeds_and_new_password_logs_in(client):
    headers = await _auth_headers(client)

    response = await client.post(
        "/auth/change-password",
        json={"current_password": PASSWORD, "new_password": "new-secure-password"},
        headers=headers,
    )
    assert response.status_code == 204

    login_response = await client.post(
        "/auth/login", json={"email": EMAIL, "password": "new-secure-password"}
    )
    assert login_response.status_code == 200

    old_login_response = await client.post(
        "/auth/login", json={"email": EMAIL, "password": PASSWORD}
    )
    assert old_login_response.status_code == 401


async def test_change_password_wrong_current_password_returns_400(client):
    headers = await _auth_headers(client)

    response = await client.post(
        "/auth/change-password",
        json={"current_password": "wrong-password", "new_password": "whatever123"},
        headers=headers,
    )

    assert response.status_code == 400


async def test_change_password_without_token_returns_401(client):
    response = await client.post(
        "/auth/change-password",
        json={"current_password": PASSWORD, "new_password": "whatever123"},
    )

    assert response.status_code == 401


async def test_register_rejects_password_bcrypt_would_truncate(client):
    response = await client.post(
        "/auth/register",
        json={"email": "long@test.com", "password": "a" * 73},
    )

    assert response.status_code == 422


async def test_register_counts_password_bytes_not_characters(client):
    # 40 umlauts are 80 UTF-8 bytes, so this is over the limit despite being
    # well under 72 characters.
    response = await client.post(
        "/auth/register",
        json={"email": "umlaut@test.com", "password": "ä" * 40},
    )

    assert response.status_code == 422


async def test_change_password_rejects_password_bcrypt_would_truncate(client):
    headers = await _auth_headers(client)

    response = await client.post(
        "/auth/change-password",
        headers=headers,
        json={"current_password": PASSWORD, "new_password": "a" * 73},
    )

    assert response.status_code == 422


async def test_login_still_accepts_overlong_password_input(client):
    # Accounts created before the limit existed may have a longer password;
    # login must compare it instead of rejecting the request outright.
    await _register(client)

    response = await client.post(
        "/auth/login",
        json={"email": EMAIL, "password": "a" * 100},
    )

    assert response.status_code == 401  # wrong password, not a 422
