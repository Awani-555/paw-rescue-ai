"""Smoke tests for main.py - these exist mainly so a broken import, a
missing dependency, or an accidentally-removed auth check gets caught in CI
before it ever reaches a deploy, since this service previously had zero
test coverage and zero CI job to catch that kind of regression."""

import os

os.environ.setdefault("INTERNAL_SERVICE_TOKEN", "test-internal-token")

import main  # noqa: E402  (must come after the env var is set)

from fastapi.testclient import TestClient

client = TestClient(main.app)

# Minimal valid 1x1 JPEG.
TINY_JPEG_BASE64 = (
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQ"
    "Ew8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAED"
    "ASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEA"
    "AAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k="
)


def test_health_is_ok_without_any_auth():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_analyze_rejects_missing_token():
    res = client.post("/analyze", json={"image": TINY_JPEG_BASE64})
    assert res.status_code == 401


def test_analyze_rejects_wrong_token():
    res = client.post(
        "/analyze",
        json={"image": TINY_JPEG_BASE64},
        headers={"X-Internal-Token": "wrong-token"},
    )
    assert res.status_code == 401


def test_analyze_succeeds_with_correct_token():
    res = client.post(
        "/analyze",
        json={"image": TINY_JPEG_BASE64},
        headers={"X-Internal-Token": "test-internal-token"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["species"] in {"Dog", "Cat", "Bird", "Unknown"}
    assert body["severity"] in {"Critical", "Urgent", "Mild"}
    assert "severity_note" in body


def test_analyze_rejects_malformed_base64_gracefully_rather_than_500ing():
    res = client.post(
        "/analyze",
        json={"image": "not valid base64!!!"},
        headers={"X-Internal-Token": "test-internal-token"},
    )
    # analyze_animal() catches decode failures itself and returns a graceful
    # Unknown/Urgent result rather than raising - this locks that behavior in.
    assert res.status_code == 200
    assert res.json()["species"] == "Unknown"


def test_dog_keyword_list_covers_a_common_breed_label():
    dog_label = "golden retriever"
    assert any(k in dog_label for k in main.DOG_KEYWORDS)
