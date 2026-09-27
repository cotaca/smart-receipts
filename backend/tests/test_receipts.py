import io
import json

from PIL import Image
from sqlmodel import select

from backend.models.receipt import ReceiptItem
from backend.services.pdf import MAX_PDF_PAGES
from tests.images import make_image_bytes, make_multipage_pdf_bytes, make_pdf_bytes

# Small enough that the preprocessing step won't downscale it, so tests that
# care about dimensions stay independent of MAX_DIMENSION.
RECEIPT_BYTES = make_image_bytes()


async def _register_and_auth(
    client, email: str, password: str = "very-secure-password"
):
    response = await client.post(
        "/auth/register", json={"email": email, "password": password}
    )
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _create_receipt(client, headers, **overrides):
    data = {
        "merchant": "Trader Joe's",
        "amount": "12.34",
        "purchased_at": "2024-01-15",
        "currency": "USD",
        "notes": "groceries",
        **overrides,
    }
    files = {"file": ("receipt.jpg", RECEIPT_BYTES, "image/jpeg")}
    return await client.post("/receipts", headers=headers, data=data, files=files)


async def test_create_receipt_returns_public_data(client, storage_backend):
    headers = await _register_and_auth(client, "owner@test.com")

    response = await _create_receipt(client, headers)

    assert response.status_code == 201
    body = response.json()
    assert body["merchant"] == "Trader Joe's"
    assert body["amount"] == "12.34"
    assert body["purchased_at"] == "2024-01-15"
    assert body["currency"] == "USD"
    assert body["notes"] == "groceries"
    assert body["original_filename"] == "receipt.jpg"
    assert body["content_type"] == "image/jpeg"
    assert body["file_size"] > 0
    assert body["image_url"] == f"/receipts/{body['id']}/image"
    assert "storage_key" not in body
    assert body["items"] == []


async def test_create_receipt_with_items_returns_them_in_order(client):
    headers = await _register_and_auth(client, "owner@test.com")
    items = [
        {
            "description": "Milch",
            "quantity": "2.000",
            "unit_price": "1.29",
            "total_price": "2.58",
        },
        {
            "description": "Brot",
            "quantity": "1.000",
            "unit_price": "2.00",
            "total_price": "2.00",
        },
    ]

    response = await _create_receipt(client, headers, items=json.dumps(items))

    assert response.status_code == 201
    body = response.json()
    assert body["items"] == items


async def test_create_receipt_invalid_items_json_returns_422_without_saving_file(
    client, storage_backend
):
    headers = await _register_and_auth(client, "owner@test.com")

    response = await _create_receipt(client, headers, items="not-json")

    assert response.status_code == 422
    assert list(storage_backend._base_path.rglob("*.jpg")) == []


async def test_create_receipt_invalid_item_quantity_returns_422_without_saving_file(
    client, storage_backend
):
    headers = await _register_and_auth(client, "owner@test.com")
    items = [
        {
            "description": "Milch",
            "quantity": "0",
            "unit_price": "1.29",
            "total_price": "0.00",
        }
    ]

    response = await _create_receipt(client, headers, items=json.dumps(items))

    assert response.status_code == 422
    assert list(storage_backend._base_path.rglob("*.jpg")) == []
    error = response.json()["detail"][0]
    assert error["loc"][:2] == ["body", "items"]


async def test_update_receipt_with_items_replaces_them(client):
    headers = await _register_and_auth(client, "owner@test.com")
    create_response = await _create_receipt(
        client,
        headers,
        items=json.dumps(
            [
                {
                    "description": "Milch",
                    "quantity": "1",
                    "unit_price": "1.29",
                    "total_price": "1.29",
                }
            ]
        ),
    )
    receipt_id = create_response.json()["id"]

    new_items = [
        {
            "description": "Brot",
            "quantity": "2.000",
            "unit_price": "2.00",
            "total_price": "4.00",
        }
    ]
    response = await client.patch(
        f"/receipts/{receipt_id}", headers=headers, json={"items": new_items}
    )

    assert response.status_code == 200
    assert response.json()["items"] == new_items


async def test_update_receipt_without_items_leaves_them_unchanged(client):
    headers = await _register_and_auth(client, "owner@test.com")
    items = [
        {
            "description": "Milch",
            "quantity": "1.000",
            "unit_price": "1.29",
            "total_price": "1.29",
        }
    ]
    create_response = await _create_receipt(client, headers, items=json.dumps(items))
    receipt_id = create_response.json()["id"]

    response = await client.patch(
        f"/receipts/{receipt_id}", headers=headers, json={"notes": "updated"}
    )

    assert response.status_code == 200
    assert response.json()["items"] == items


async def test_create_receipt_rejects_unsupported_content_type(client):
    headers = await _register_and_auth(client, "owner@test.com")

    response = await client.post(
        "/receipts",
        headers=headers,
        data={"merchant": "Shop", "amount": "1.00", "purchased_at": "2024-01-15"},
        files={"file": ("receipt.txt", b"not an image", "text/plain")},
    )

    assert response.status_code == 400


async def test_create_receipt_rejects_undecodable_image(client):
    headers = await _register_and_auth(client, "owner@test.com")

    response = await client.post(
        "/receipts",
        headers=headers,
        data={"merchant": "Shop", "amount": "1.00", "purchased_at": "2024-01-15"},
        files={"file": ("receipt.jpg", b"not-a-real-image", "image/jpeg")},
    )

    assert response.status_code == 400


async def test_create_receipt_rejects_truncated_image(client):
    headers = await _register_and_auth(client, "owner@test.com")
    truncated = RECEIPT_BYTES[: len(RECEIPT_BYTES) // 2]

    response = await client.post(
        "/receipts",
        headers=headers,
        data={"merchant": "Shop", "amount": "1.00", "purchased_at": "2024-01-15"},
        files={"file": ("receipt.jpg", truncated, "image/jpeg")},
    )

    assert response.status_code == 400


async def test_create_receipt_accepts_pdf(client):
    headers = await _register_and_auth(client, "owner@test.com")
    pdf_bytes = make_pdf_bytes(["REWE", "SUMME 12,34"])

    response = await client.post(
        "/receipts",
        headers=headers,
        data={"merchant": "REWE", "amount": "12.34", "purchased_at": "2024-01-15"},
        files={"file": ("bon.pdf", pdf_bytes, "application/pdf")},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["content_type"] == "application/pdf"

    image_response = await client.get(f"/receipts/{body['id']}/image", headers=headers)
    assert image_response.status_code == 200
    assert image_response.headers["content-type"] == "application/pdf"
    assert image_response.content == pdf_bytes


async def test_create_receipt_rejects_junk_declared_as_pdf(client):
    headers = await _register_and_auth(client, "owner@test.com")

    response = await client.post(
        "/receipts",
        headers=headers,
        data={"merchant": "Shop", "amount": "1.00", "purchased_at": "2024-01-15"},
        files={"file": ("bon.pdf", b"not a pdf", "application/pdf")},
    )

    assert response.status_code == 400


async def test_create_receipt_rejects_pdf_with_too_many_pages(client):
    headers = await _register_and_auth(client, "owner@test.com")
    pdf_bytes = make_multipage_pdf_bytes(MAX_PDF_PAGES + 1)

    response = await client.post(
        "/receipts",
        headers=headers,
        data={"merchant": "Shop", "amount": "1.00", "purchased_at": "2024-01-15"},
        files={"file": ("bon.pdf", pdf_bytes, "application/pdf")},
    )

    assert response.status_code == 400


async def test_create_receipt_missing_required_field_returns_422(client):
    headers = await _register_and_auth(client, "owner@test.com")

    response = await client.post(
        "/receipts",
        headers=headers,
        data={"amount": "1.00", "purchased_at": "2024-01-15"},
        files={"file": ("receipt.jpg", RECEIPT_BYTES, "image/jpeg")},
    )

    assert response.status_code == 422


async def test_create_receipt_requires_auth(client):
    response = await client.post(
        "/receipts",
        data={"merchant": "Shop", "amount": "1.00", "purchased_at": "2024-01-15"},
        files={"file": ("receipt.jpg", RECEIPT_BYTES, "image/jpeg")},
    )

    assert response.status_code == 401


async def test_list_receipts_returns_only_own(client):
    owner_headers = await _register_and_auth(client, "owner@test.com")
    other_headers = await _register_and_auth(client, "other@test.com")
    await _create_receipt(client, owner_headers)
    await _create_receipt(client, other_headers)

    response = await client.get("/receipts", headers=owner_headers)

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["merchant"] == "Trader Joe's"


async def test_get_receipt_returns_404_for_nonexistent(client):
    headers = await _register_and_auth(client, "owner@test.com")

    response = await client.get(
        "/receipts/00000000-0000-0000-0000-000000000000", headers=headers
    )

    assert response.status_code == 404


async def test_get_receipt_returns_404_for_other_users_receipt(client):
    owner_headers = await _register_and_auth(client, "owner@test.com")
    other_headers = await _register_and_auth(client, "other@test.com")
    create_response = await _create_receipt(client, owner_headers)
    receipt_id = create_response.json()["id"]

    response = await client.get(f"/receipts/{receipt_id}", headers=other_headers)

    assert response.status_code == 404


async def test_update_receipt_partial_update(client):
    headers = await _register_and_auth(client, "owner@test.com")
    create_response = await _create_receipt(client, headers)
    receipt_id = create_response.json()["id"]

    response = await client.patch(
        f"/receipts/{receipt_id}", headers=headers, json={"notes": "updated notes"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["notes"] == "updated notes"
    assert body["merchant"] == "Trader Joe's"


async def test_update_receipt_other_users_receipt_404(client):
    owner_headers = await _register_and_auth(client, "owner@test.com")
    other_headers = await _register_and_auth(client, "other@test.com")
    create_response = await _create_receipt(client, owner_headers)
    receipt_id = create_response.json()["id"]

    response = await client.patch(
        f"/receipts/{receipt_id}", headers=other_headers, json={"notes": "hijacked"}
    )

    assert response.status_code == 404


async def test_delete_receipt_removes_row_and_file(client, storage_backend):
    headers = await _register_and_auth(client, "owner@test.com")
    create_response = await _create_receipt(client, headers)
    receipt_id = create_response.json()["id"]

    delete_response = await client.delete(f"/receipts/{receipt_id}", headers=headers)
    assert delete_response.status_code == 204

    get_response = await client.get(f"/receipts/{receipt_id}", headers=headers)
    assert get_response.status_code == 404


async def test_delete_receipt_removes_item_rows(client, db_session):
    headers = await _register_and_auth(client, "owner@test.com")
    create_response = await _create_receipt(
        client,
        headers,
        items=json.dumps(
            [
                {
                    "description": "Milch",
                    "quantity": "1",
                    "unit_price": "1.29",
                    "total_price": "1.29",
                }
            ]
        ),
    )
    receipt_id = create_response.json()["id"]

    await client.delete(f"/receipts/{receipt_id}", headers=headers)

    remaining = db_session.exec(
        select(ReceiptItem).where(ReceiptItem.receipt_id == receipt_id)
    ).all()
    assert remaining == []


async def test_delete_other_users_receipt_404(client):
    owner_headers = await _register_and_auth(client, "owner@test.com")
    other_headers = await _register_and_auth(client, "other@test.com")
    create_response = await _create_receipt(client, owner_headers)
    receipt_id = create_response.json()["id"]

    response = await client.delete(f"/receipts/{receipt_id}", headers=other_headers)

    assert response.status_code == 404


async def test_get_receipt_image_returns_bytes(client):
    headers = await _register_and_auth(client, "owner@test.com")
    create_response = await _create_receipt(client, headers)
    receipt_id = create_response.json()["id"]

    response = await client.get(f"/receipts/{receipt_id}/image", headers=headers)

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"
    assert Image.open(io.BytesIO(response.content)).format == "JPEG"


async def test_get_receipt_image_other_user_404(client):
    owner_headers = await _register_and_auth(client, "owner@test.com")
    other_headers = await _register_and_auth(client, "other@test.com")
    create_response = await _create_receipt(client, owner_headers)
    receipt_id = create_response.json()["id"]

    response = await client.get(f"/receipts/{receipt_id}/image", headers=other_headers)

    assert response.status_code == 404


async def test_replace_receipt_image_updates_metadata(client):
    headers = await _register_and_auth(client, "owner@test.com")
    create_response = await _create_receipt(client, headers)
    receipt_id = create_response.json()["id"]

    response = await client.put(
        f"/receipts/{receipt_id}/image",
        headers=headers,
        files={"file": ("new-receipt.jpg", RECEIPT_BYTES, "image/jpeg")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == receipt_id
    assert body["original_filename"] == "new-receipt.jpg"
    assert body["file_size"] > 0


async def test_replace_receipt_image_deletes_old_file(client, storage_backend):
    headers = await _register_and_auth(client, "owner@test.com")
    create_response = await _create_receipt(client, headers)
    receipt_id = create_response.json()["id"]

    receipts_dir = storage_backend._base_path
    files_before = list(receipts_dir.rglob("*.jpg"))
    assert len(files_before) == 1

    await client.put(
        f"/receipts/{receipt_id}/image",
        headers=headers,
        files={"file": ("new-receipt.jpg", RECEIPT_BYTES, "image/jpeg")},
    )

    files_after = list(receipts_dir.rglob("*.jpg"))
    assert len(files_after) == 1


async def test_replace_receipt_image_serves_new_bytes(client):
    headers = await _register_and_auth(client, "owner@test.com")
    create_response = await _create_receipt(client, headers)
    receipt_id = create_response.json()["id"]

    from tests.images import make_image_bytes

    # A different size than RECEIPT_BYTES' default (100, 100) distinguishes
    # "still serving the old file" from "serving the replacement".
    new_bytes = make_image_bytes(size=(50, 50))
    await client.put(
        f"/receipts/{receipt_id}/image",
        headers=headers,
        files={"file": ("new-receipt.jpg", new_bytes, "image/jpeg")},
    )

    response = await client.get(f"/receipts/{receipt_id}/image", headers=headers)
    assert response.status_code == 200
    fetched = Image.open(io.BytesIO(response.content))
    assert fetched.size == (50, 50)


async def test_replace_receipt_image_other_users_receipt_404(client):
    owner_headers = await _register_and_auth(client, "owner@test.com")
    other_headers = await _register_and_auth(client, "other@test.com")
    create_response = await _create_receipt(client, owner_headers)
    receipt_id = create_response.json()["id"]

    response = await client.put(
        f"/receipts/{receipt_id}/image",
        headers=other_headers,
        files={"file": ("new-receipt.jpg", RECEIPT_BYTES, "image/jpeg")},
    )

    assert response.status_code == 404


async def test_replace_receipt_image_rejects_undecodable_image(client):
    headers = await _register_and_auth(client, "owner@test.com")
    create_response = await _create_receipt(client, headers)
    receipt_id = create_response.json()["id"]

    response = await client.put(
        f"/receipts/{receipt_id}/image",
        headers=headers,
        files={"file": ("bad.jpg", b"not-a-real-image", "image/jpeg")},
    )

    assert response.status_code == 400


async def test_replace_receipt_image_rejects_unsupported_content_type(client):
    headers = await _register_and_auth(client, "owner@test.com")
    create_response = await _create_receipt(client, headers)
    receipt_id = create_response.json()["id"]

    response = await client.put(
        f"/receipts/{receipt_id}/image",
        headers=headers,
        files={"file": ("bad.txt", b"not an image", "text/plain")},
    )

    assert response.status_code == 400


async def test_replace_receipt_image_with_pdf(client):
    headers = await _register_and_auth(client, "owner@test.com")
    create_response = await _create_receipt(client, headers)
    receipt_id = create_response.json()["id"]
    pdf_bytes = make_pdf_bytes(["REWE"])

    response = await client.put(
        f"/receipts/{receipt_id}/image",
        headers=headers,
        files={"file": ("bon.pdf", pdf_bytes, "application/pdf")},
    )

    assert response.status_code == 200
    assert response.json()["content_type"] == "application/pdf"

    image_response = await client.get(f"/receipts/{receipt_id}/image", headers=headers)
    assert image_response.headers["content-type"] == "application/pdf"
    assert image_response.content == pdf_bytes


async def test_replace_receipt_pdf_with_image(client):
    headers = await _register_and_auth(client, "owner@test.com")
    create_response = await client.post(
        "/receipts",
        headers=headers,
        data={"merchant": "Shop", "amount": "1.00", "purchased_at": "2024-01-15"},
        files={"file": ("bon.pdf", make_pdf_bytes(["Shop"]), "application/pdf")},
    )
    receipt_id = create_response.json()["id"]

    response = await client.put(
        f"/receipts/{receipt_id}/image",
        headers=headers,
        files={"file": ("new-receipt.jpg", RECEIPT_BYTES, "image/jpeg")},
    )

    assert response.status_code == 200
    assert response.json()["content_type"] == "image/jpeg"

    image_response = await client.get(f"/receipts/{receipt_id}/image", headers=headers)
    assert image_response.headers["content-type"] == "image/jpeg"


async def test_replace_receipt_image_requires_auth(client):
    create_response = await _create_receipt(
        client, await _register_and_auth(client, "owner@test.com")
    )
    receipt_id = create_response.json()["id"]

    response = await client.put(
        f"/receipts/{receipt_id}/image",
        files={"file": ("new-receipt.jpg", RECEIPT_BYTES, "image/jpeg")},
    )

    assert response.status_code == 401
