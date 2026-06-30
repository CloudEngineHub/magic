"""OAuth2 授权 callback relay 抽象。"""

from app.infrastructure.oauth2.callback_relay.factory import create_callback_relay
from app.infrastructure.oauth2.callback_relay.interface import OAuth2CallbackRelay
from app.infrastructure.oauth2.callback_relay.models import OAuth2CallbackPayload, OAuth2CallbackResult

__all__ = [
    "OAuth2CallbackPayload",
    "OAuth2CallbackRelay",
    "OAuth2CallbackResult",
    "create_callback_relay",
]
