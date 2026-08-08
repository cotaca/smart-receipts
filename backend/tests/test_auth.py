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
