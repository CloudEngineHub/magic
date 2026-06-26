import pytest

from app.infrastructure.magic_service.exceptions import ConfigurationError
from app.infrastructure.oauth2.callback_relay.drivers.magic_service import (
    DEFAULT_TIMEOUT_SECONDS,
    MagicServiceCallbackRelayConfig,
    MagicServiceOAuth2CallbackRelay,
)
from app.infrastructure.oauth2.callback_relay.models import OAuth2CallbackStatus
from app.infrastructure.sdk.magic_service.api.oauth2_callback_relay_api import (
    DEFAULT_OAUTH2_CALLBACK_RELAY_PATH,
)
from app.utils.init_client_message_util import InitializationError


def _relay() -> MagicServiceOAuth2CallbackRelay:
    return MagicServiceOAuth2CallbackRelay(
        MagicServiceCallbackRelayConfig(
            base_url="https://example.test",
            redirect_uri="https://example.test/api/v1/open-api/sandbox/oauth2/callback-relay",
        )
    )


def test_get_redirect_uri_returns_configured_uri():
    relay = _relay()

    assert relay.get_redirect_uri("notion") == "https://example.test/api/v1/open-api/sandbox/oauth2/callback-relay"


def test_build_operation_path_uses_redirect_uri_base_path():
    relay = _relay()

    assert relay._build_operation_path("/api/v1/open-api/sandbox/oauth2/callback-relay", "fetch-callback") == (
        "/api/v1/open-api/sandbox/oauth2/callback-relay/fetch-callback"
    )


def test_load_config_uses_init_client_message_magic_service_host(monkeypatch):
    monkeypatch.setenv("OAUTH2_MAGIC_SERVICE_BASE_URL", "https://env.example.test")
    monkeypatch.setenv("OAUTH2_MAGIC_SERVICE_REDIRECT_URI", "https://env.example.test/custom/callback")
    monkeypatch.setattr(
        "app.infrastructure.oauth2.callback_relay.drivers.magic_service.InitClientMessageUtil.get_magic_service_host",
        lambda: "https://init.example.test",
    )

    config = MagicServiceOAuth2CallbackRelay._load_config()

    assert config.base_url == "https://init.example.test"
    assert config.relay_path == DEFAULT_OAUTH2_CALLBACK_RELAY_PATH
    assert config.redirect_uri == "https://init.example.test/api/v1/open-api/sandbox/oauth2/callback-relay"
    assert config.timeout_seconds == DEFAULT_TIMEOUT_SECONDS


def test_load_config_raises_when_init_client_message_missing(monkeypatch):
    monkeypatch.setenv("OAUTH2_MAGIC_SERVICE_BASE_URL", "https://env.example.test")

    def raise_initialization_error():
        raise InitializationError("missing init client message")

    monkeypatch.setattr(
        "app.infrastructure.oauth2.callback_relay.drivers.magic_service.InitClientMessageUtil.get_magic_service_host",
        raise_initialization_error,
    )

    with pytest.raises(ConfigurationError, match="init_client_message"):
        MagicServiceOAuth2CallbackRelay._load_config()


def test_parse_received_callback_result():
    result = _relay()._parse_callback_result(
        {
            "status": "received",
            "payload": {
                "state": "state-1",
                "code": "auth-code",
                "received_at": "2026-06-24 18:00:00",
                "source": "magic_service",
            },
        },
        expected_state="state-1",
    )

    assert result.status == OAuth2CallbackStatus.RECEIVED
    assert result.payload is not None
    assert result.payload.code == "auth-code"


def test_parse_denied_callback_result():
    result = _relay()._parse_callback_result(
        {
            "status": "received",
            "payload": {
                "state": "state-1",
                "error": "access_denied",
                "error_description": "user denied",
            },
        },
        expected_state="state-1",
    )

    assert result.status == OAuth2CallbackStatus.DENIED
    assert result.message == "user denied"


def test_parse_callback_result_rejects_state_mismatch():
    result = _relay()._parse_callback_result(
        {
            "status": "received",
            "payload": {
                "state": "state-2",
                "code": "auth-code",
            },
        },
        expected_state="state-1",
    )

    assert result.status == OAuth2CallbackStatus.FAILED
    assert result.message == "Callback state does not match."


def test_parse_pending_callback_result():
    result = _relay()._parse_callback_result(
        {"status": "pending", "payload": None, "message": "not found"},
        expected_state="state-1",
    )

    assert result.status == OAuth2CallbackStatus.PENDING
    assert result.message == "not found"


def test_parse_expired_callback_result():
    result = _relay()._parse_callback_result(
        {"status": "expired", "payload": None, "message": "expired"},
        expected_state="state-1",
    )

    assert result.status == OAuth2CallbackStatus.EXPIRED
    assert result.message == "expired"
