from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app


def test_healthcheck_returns_ok() -> None:
    client = TestClient(app)

    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"ok": True}

def test_openapi_lists_finance_routes() -> None:
    client = TestClient(app)

    schema = client.get("/openapi.json").json()

    assert "/api/finance/quotes" in schema["paths"]
    assert "/api/finance/sparklines" in schema["paths"]
    assert "/api/finance/news" in schema["paths"]
    assert "/api/finance/economics" in schema["paths"]


def test_get_settings_reads_environment_override(monkeypatch) -> None:
    monkeypatch.setenv("APP_NAME", "Env Override")
    get_settings.cache_clear()

    try:
        assert get_settings().app_name == "Env Override"
    finally:
        get_settings.cache_clear()