"""OAuth2 callback relay driver 实现。"""

from app.infrastructure.oauth2.callback_relay.drivers.local import LocalOAuth2CallbackRelay
from app.infrastructure.oauth2.callback_relay.drivers.magic_service import MagicServiceOAuth2CallbackRelay

__all__ = ["LocalOAuth2CallbackRelay", "MagicServiceOAuth2CallbackRelay"]
