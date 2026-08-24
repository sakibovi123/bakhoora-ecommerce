"""Uploading product images: several at once, capped, with one primary."""

import base64
from pathlib import Path

import pytest

from app.core.config import settings
from app.utils.uploads import media_root
from tests.conftest import auth, standard_variants

# A real 1x1 PNG, so the magic-byte check is exercised rather than faked.
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
WEBP = b"RIFF" + b"\x00\x00\x00\x00" + b"WEBP" + b"\x00" * 32
# Same RIFF container, different payload — must not pass as an image.
WAV = b"RIFF" + b"\x00\x00\x00\x00" + b"WAVE" + b"\x00" * 32


def upload(name: str, payload: bytes = PNG, mime: str = "image/png"):
    return ("files", (name, payload, mime))


@pytest.fixture(autouse=True)
def media_in_tmp(tmp_path, monkeypatch):
    """Keep uploads out of the working tree."""
    monkeypatch.setattr(settings, "MEDIA_ROOT", str(tmp_path / "media"))
    return tmp_path


async def _product(client, admin_token, name="Photo Oud"):
    response = await client.post(
        "/api/v1/products",
        headers=auth(admin_token),
        json={"name": name, "variants": standard_variants()},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _upload(client, token, product_id, files):
    return await client.post(
        f"/api/v1/products/{product_id}/images/upload",
        files=files,
        headers=auth(token),
    )


# --- uploading -------------------------------------------------------------

async def test_several_images_upload_in_one_request(client, admin_token):
    product = await _product(client, admin_token)
    response = await _upload(
        client,
        admin_token,
        product["id"],
        [
            upload("a.png"),
            upload("b.jpg", JPEG, "image/jpeg"),
            upload("c.webp", WEBP, "image/webp"),
        ],
    )
    assert response.status_code == 201, response.text
    images = response.json()["images"]
    assert len(images) == 3
    assert [i["position"] for i in images] == [0, 1, 2]
    # Every file landed on disk under a generated name.
    assert len(list(Path(media_root()).glob("*"))) == 3
    assert all(i["url"].startswith("/media/products/") for i in images)


async def test_the_first_image_becomes_primary(client, admin_token):
    product = await _product(client, admin_token)
    body = (await _upload(client, admin_token, product["id"],
                          [upload("a.png"), upload("b.png")])).json()
    assert [i["is_primary"] for i in body["images"]] == [True, False]
    assert body["primary_image"] == body["images"][0]["url"]


async def test_four_is_the_limit(client, admin_token):
    product = await _product(client, admin_token)
    filled = await _upload(client, admin_token, product["id"],
                           [upload(f"{n}.png") for n in range(4)])
    assert filled.status_code == 201
    assert len(filled.json()["images"]) == settings.MAX_PRODUCT_IMAGES

    over = await _upload(client, admin_token, product["id"], [upload("five.png")])
    assert over.status_code == 422
    assert "maximum of 4 images" in over.text


async def test_a_batch_that_would_overflow_is_refused_whole(client, admin_token):
    product = await _product(client, admin_token)
    await _upload(client, admin_token, product["id"], [upload("a.png"), upload("b.png")])

    over = await _upload(client, admin_token, product["id"],
                         [upload(f"{n}.png") for n in range(3)])
    assert over.status_code == 422
    assert "Only 2 image slots left" in over.text
    # Nothing from the rejected batch was kept.
    detail = await client.get(f"/api/v1/admin/products/{product['id']}",
                              headers=auth(admin_token))
    assert len(detail.json()["images"]) == 2
    assert len(list(Path(media_root()).glob("*"))) == 2


async def test_url_images_count_against_the_same_limit(client, admin_token):
    product = await _product(client, admin_token)
    await _upload(client, admin_token, product["id"],
                  [upload(f"{n}.png") for n in range(4)])
    response = await client.post(
        f"/api/v1/products/{product['id']}/images",
        json={"url": "https://example.com/x.jpg"},
        headers=auth(admin_token),
    )
    assert response.status_code == 422


# --- what counts as an image ----------------------------------------------

async def test_a_non_image_is_refused(client, admin_token):
    product = await _product(client, admin_token)
    response = await _upload(
        client, admin_token, product["id"],
        [("files", ("notes.txt", b"just some text", "image/png"))],
    )
    assert response.status_code == 422
    assert "not an image the shop can use" in response.text
    assert not list(Path(media_root()).glob("*"))


async def test_a_riff_file_that_is_not_webp_is_refused(client, admin_token):
    """RIFF alone is not enough — WAV and WebP share the container."""
    product = await _product(client, admin_token)
    response = await _upload(client, admin_token, product["id"],
                             [("files", ("sound.webp", WAV, "image/webp"))])
    assert response.status_code == 422


async def test_an_oversized_file_is_refused(client, admin_token):
    product = await _product(client, admin_token)
    fat = PNG + b"\x00" * (settings.MAX_IMAGE_BYTES + 1)
    response = await _upload(client, admin_token, product["id"],
                             [("files", ("huge.png", fat, "image/png"))])
    assert response.status_code == 422
    assert "larger than" in response.text


async def test_one_bad_file_rejects_the_batch_and_leaves_no_orphans(client, admin_token):
    product = await _product(client, admin_token)
    response = await _upload(
        client, admin_token, product["id"],
        [upload("good.png"), ("files", ("bad.txt", b"nope", "image/png"))],
    )
    assert response.status_code == 422
    # The good file was written before the bad one failed; it must be cleaned up.
    assert not list(Path(media_root()).glob("*"))


# --- choosing the primary --------------------------------------------------

async def test_admin_can_change_the_primary(client, admin_token):
    product = await _product(client, admin_token)
    images = (await _upload(client, admin_token, product["id"],
                            [upload("a.png"), upload("b.png"), upload("c.png")])).json()["images"]

    response = await client.patch(
        f"/api/v1/products/images/{images[2]['id']}",
        json={"is_primary": True},
        headers=auth(admin_token),
    )
    assert response.status_code == 200
    flags = {i["id"]: i["is_primary"] for i in response.json()["images"]}
    assert flags[images[2]["id"]] is True
    assert sum(flags.values()) == 1
    assert response.json()["primary_image"] == images[2]["url"]


async def test_the_primary_cannot_simply_be_switched_off(client, admin_token):
    product = await _product(client, admin_token)
    images = (await _upload(client, admin_token, product["id"],
                            [upload("a.png"), upload("b.png")])).json()["images"]
    response = await client.patch(
        f"/api/v1/products/images/{images[0]['id']}",
        json={"is_primary": False},
        headers=auth(admin_token),
    )
    assert response.status_code == 422
    assert "always has a primary image" in response.text


async def test_alt_text_can_be_edited(client, admin_token):
    product = await _product(client, admin_token)
    images = (await _upload(client, admin_token, product["id"], [upload("a.png")])).json()["images"]
    response = await client.patch(
        f"/api/v1/products/images/{images[0]['id']}",
        json={"alt_text": "Bottle on linen"},
        headers=auth(admin_token),
    )
    assert response.status_code == 200
    assert response.json()["images"][0]["alt_text"] == "Bottle on linen"


# --- removing --------------------------------------------------------------

async def test_deleting_the_primary_promotes_another(client, admin_token):
    product = await _product(client, admin_token)
    images = (await _upload(client, admin_token, product["id"],
                            [upload("a.png"), upload("b.png")])).json()["images"]

    removed = await client.delete(
        f"/api/v1/products/images/{images[0]['id']}", headers=auth(admin_token)
    )
    assert removed.status_code == 204

    detail = (await client.get(f"/api/v1/admin/products/{product['id']}",
                               headers=auth(admin_token))).json()
    assert len(detail["images"]) == 1
    assert detail["images"][0]["is_primary"] is True
    assert detail["primary_image"] == images[1]["url"]


async def test_deleting_an_image_removes_the_file(client, admin_token):
    product = await _product(client, admin_token)
    images = (await _upload(client, admin_token, product["id"], [upload("a.png")])).json()["images"]
    assert len(list(Path(media_root()).glob("*"))) == 1

    await client.delete(f"/api/v1/products/images/{images[0]['id']}", headers=auth(admin_token))
    assert not list(Path(media_root()).glob("*"))


async def test_freeing_a_slot_allows_another_upload(client, admin_token):
    product = await _product(client, admin_token)
    images = (await _upload(client, admin_token, product["id"],
                            [upload(f"{n}.png") for n in range(4)])).json()["images"]
    await client.delete(f"/api/v1/products/images/{images[1]['id']}", headers=auth(admin_token))

    again = await _upload(client, admin_token, product["id"], [upload("new.png")])
    assert again.status_code == 201
    assert len(again.json()["images"]) == 4


async def test_deleting_a_product_takes_its_files_with_it(client, admin_token):
    """The rows cascade in the database; the files on disk have to be told."""
    product = await _product(client, admin_token, name="Doomed Oud")
    await _upload(client, admin_token, product["id"],
                  [upload("a.png"), upload("b.png"), upload("c.png")])
    assert len(list(Path(media_root()).glob("*"))) == 3

    removed = await client.delete(
        f"/api/v1/products/{product['id']}", headers=auth(admin_token)
    )
    assert removed.status_code == 204
    assert not list(Path(media_root()).glob("*"))


# --- access ----------------------------------------------------------------

async def test_uploading_needs_products_manage(client, admin_token, customer_token):
    product = await _product(client, admin_token)
    response = await _upload(client, customer_token, product["id"], [upload("a.png")])
    assert response.status_code == 403
