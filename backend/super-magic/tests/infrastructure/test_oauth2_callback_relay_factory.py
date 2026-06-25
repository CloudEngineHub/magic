from app.infrastructure.oauth2.callback_relay.drivers.local import LocalOAuth2CallbackRelay
from app.infrastructure.oauth2.callback_relay.drivers.magic_service import MagicServiceOAuth2CallbackRelay
from app.infrastructure.oauth2.callback_relay.factory import create_callback_relay


def test_create_callback_relay_defaults_to_magic_service(monkeypatch):
    monkeypatch.delenv("OAUTH2_CALLBACK_RELAY_DRIVER", raising=False)
    monkeypatch.setattr(
        "app.infrastructure.oauth2.callback_relay.drivers.magic_service.InitClientMessageUtil.get_magic_service_host",
        lambda: "https://magic-service.example.test",
    )

    relay = create_callback_relay()

    assert isinstance(relay, MagicServiceOAuth2CallbackRelay)


def test_create_callback_relay_can_use_local_driver(monkeypatch):
    monkeypatch.setenv("OAUTH2_CALLBACK_RELAY_DRIVER", "local")

    relay = create_callback_relay()

    assert isinstance(relay, LocalOAuth2CallbackRelay)
