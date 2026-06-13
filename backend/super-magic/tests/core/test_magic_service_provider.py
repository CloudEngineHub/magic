from copy import deepcopy

import httpx
import pytest

from agentlang.config.models.model_config_manager import model_config_manager
from app.core.model_providers.magic_service_provider import (
    MagicServiceProvider,
    MagicServiceProviderError,
    PROVIDER_TYPE,
)


class _FakeAsyncClient:
    def __init__(self, response_payload: dict):
        self.response_payload = response_payload

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def get(self, url: str, params: dict, headers: dict):
        return httpx.Response(
            200,
            json=self.response_payload,
            request=httpx.Request("GET", url),
        )


@pytest.fixture(autouse=True)
def restore_model_registry():
    saved_state = {
        "_models": deepcopy(model_config_manager._models),
        "_registered_providers": dict(model_config_manager._registered_providers),
        "_loaded_provider_types": set(model_config_manager._loaded_provider_types),
        "_use_counts": dict(model_config_manager._use_counts),
        "_last_loaded_at": dict(model_config_manager._last_loaded_at),
        "_refreshing": set(model_config_manager._refreshing),
    }

    yield

    model_config_manager._models = saved_state["_models"]
    model_config_manager._registered_providers = saved_state["_registered_providers"]
    model_config_manager._loaded_provider_types = saved_state["_loaded_provider_types"]
    model_config_manager._use_counts = saved_state["_use_counts"]
    model_config_manager._last_loaded_at = saved_state["_last_loaded_at"]
    model_config_manager._refreshing = saved_state["_refreshing"]


def _patch_credentials(monkeypatch: pytest.MonkeyPatch, provider: MagicServiceProvider) -> None:
    monkeypatch.setattr(
        provider,
        "_get_credentials",
        lambda: ("https://magic.example.com", "mock-user-token"),
    )


def _patch_response(monkeypatch: pytest.MonkeyPatch, payload: dict) -> None:
    monkeypatch.setattr(
        "app.core.model_providers.magic_service_provider.httpx.AsyncClient",
        lambda timeout: _FakeAsyncClient(payload),
    )


@pytest.mark.asyncio
async def test_magic_service_provider_rejects_business_error(monkeypatch: pytest.MonkeyPatch):
    provider = MagicServiceProvider()
    _patch_credentials(monkeypatch, provider)
    _patch_response(
        monkeypatch,
        {"code": 403, "message": "token invalid", "data": {}},
    )

    with pytest.raises(MagicServiceProviderError, match="code=403"):
        await provider.load()


@pytest.mark.asyncio
async def test_model_manager_does_not_mark_magic_service_loaded_on_business_error(
    monkeypatch: pytest.MonkeyPatch,
):
    provider = MagicServiceProvider()
    _patch_credentials(monkeypatch, provider)
    _patch_response(
        monkeypatch,
        {"code": 403, "message": "token invalid", "data": {}},
    )

    await model_config_manager.refresh_provider(provider)

    assert not model_config_manager.is_provider_loaded(PROVIDER_TYPE)


@pytest.mark.asyncio
async def test_magic_service_provider_parses_success_payload(monkeypatch: pytest.MonkeyPatch):
    provider = MagicServiceProvider()
    _patch_credentials(monkeypatch, provider)
    monkeypatch.setenv("MAGIC_API_KEY", "mock-api-key")
    monkeypatch.setenv("MAGIC_API_BASE_URL", "https://llm.example.com/v1")
    _patch_response(
        monkeypatch,
        {
            "code": 1000,
            "message": "ok",
            "data": [
                {
                    "id": "dynamic-auto",
                    "name": "auto-router",
                    "info": {
                        "options": {
                            "max_tokens": "200000",
                            "max_output_tokens": "64000",
                            "function_call": True,
                            "default_temperature": "0.7",
                        },
                        "attributes": {
                            "label": "Auto",
                            "resolved_model_id": "claude-sonnet-4.6",
                        },
                    },
                }
            ],
        },
    )

    models = await provider.load()

    assert len(models) == 1
    model = models[0]
    assert model.model_id == "dynamic-auto"
    assert model.name == "auto-router"
    assert model.api_key == "mock-api-key"
    assert model.api_base_url == "https://llm.example.com/v1"
    assert model.supports_tool_use is True
    assert model.max_context_tokens == 200000
    assert model.max_output_tokens == 64000
    assert model.metadata["label"] == "Auto"
    assert model.resolved_model_id == "claude-sonnet-4.6"
    assert model.provider_source == PROVIDER_TYPE
