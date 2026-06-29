"""
Magic Service API Implementations

Concrete API implementations for various Magic Service endpoints.
"""

from .ai_ability_api import AiAbilityApi
from .agent_api import AgentApi
from .file_api import FileApi  # TEMP: scan-wav workaround, remove when MagicFS auto-refreshes
from .magicbase_api import MagicBaseApi
from .message_schedule_api import MessageScheduleApi
from .oauth2_callback_relay_api import OAuth2CallbackRelayApi
from .share_api import ShareApi
from app.infrastructure.sdk.magic_service.api.web_scrape_client import WebScrapeClient, WebScrapeResponse


__all__ = [
    'AiAbilityApi',
    'AgentApi',
    'FileApi',
    'MagicBaseApi',
    'MessageScheduleApi',
    'OAuth2CallbackRelayApi',
    'ShareApi',
    "WebScrapeClient",
    "WebScrapeResponse",
]
