"""OAuth2 callback relay driver 工厂。"""

from __future__ import annotations

import os

from app.infrastructure.oauth2.callback_relay.drivers.local import LocalOAuth2CallbackRelay
from app.infrastructure.oauth2.callback_relay.drivers.magic_service import MagicServiceOAuth2CallbackRelay
from app.infrastructure.oauth2.callback_relay.interface import OAuth2CallbackRelay

ENV_CALLBACK_RELAY_DRIVER = "OAUTH2_CALLBACK_RELAY_DRIVER"


def create_callback_relay() -> OAuth2CallbackRelay:
    """创建当前配置的 OAuth2 callback relay driver。"""
    driver = (os.getenv(ENV_CALLBACK_RELAY_DRIVER) or "local").strip().lower()
    if driver == "local":
        return LocalOAuth2CallbackRelay()
    if driver == "magic_service":
        return MagicServiceOAuth2CallbackRelay()
    raise ValueError(f"Unsupported OAuth2 callback relay driver: {driver}")
