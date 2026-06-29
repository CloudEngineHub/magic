"""
Magic Service API

Main API class providing access to all Magic Service APIs.
"""

import hashlib
from typing import Dict, Any, Optional, TYPE_CHECKING
from urllib.parse import urlparse

from app.infrastructure.sdk.base import SdkBase, SdkContext
from .api.ai_ability_api import AiAbilityApi
from .api.agent_api import AgentApi
from .api.file_api import FileApi  # TEMP: scan-wav workaround, remove when MagicFS auto-refreshes
from .api.magicbase_api import MagicBaseApi
from .api.message_schedule_api import MessageScheduleApi
from .api.oauth2_callback_relay_api import OAuth2CallbackRelayApi
from .api.skill_api import SkillApi
from .api.share_api import ShareApi

class MagicService:
    """Magic Service - Main router for all Magic Service operations"""

    NAME = 'magic_service'

    def __init__(self, sdk_base: SdkBase):
        """
        Initialize Magic Service API

        Args:
            sdk_base: SdkBase instance for HTTP operations
        """
        # Create unique key for this instance
        config_data = sdk_base.get_config().to_dict()
        self.key = hashlib.md5(
            f"{self.NAME}{str(config_data)}".encode()
        ).hexdigest()

        # Register in global context if not already registered
        if not SdkContext.has(self.key):
            SdkContext.register(self.key, sdk_base)

        # Initialize API routes
        self._routes = {
            'ai_ability': AiAbilityApi,
            'agent': AgentApi,
            'file': FileApi,  # TEMP: scan-wav workaround, remove when MagicFS auto-refreshes
            'magicbase': MagicBaseApi,
            'message_schedule': MessageScheduleApi,
            'oauth2_callback_relay': OAuth2CallbackRelayApi,
            'skill': SkillApi,
            'share': ShareApi,
        }

        # Initialize fetched API instances
        self._fetched_definitions = {}
        self._register_apis(sdk_base)

    def __getattr__(self, name: str):
        """
        Magic method to provide property-style access to APIs

        Args:
            name: API name to access

        Returns:
            API instance

        Raises:
            AttributeError: If API route not found
        """
        api_instance = self._fetched_definitions.get(name)
        if api_instance is None:
            raise AttributeError(f"No API route found for '{name}'. Available routes: {list(self._routes.keys())}")
        return api_instance

    @property
    def agent(self) -> 'AgentApi':
        """Get agent API instance"""
        return self._fetched_definitions['agent']

    @property
    def ai_ability(self) -> 'AiAbilityApi':
        """Get AI ability API instance."""
        return self._fetched_definitions['ai_ability']

    @property
    def file(self) -> 'FileApi':
        """Get file API instance.

        # TEMP: scan-wav workaround, remove when MagicFS auto-refreshes.
        """
        return self._fetched_definitions['file']

    @property
    def magicbase(self) -> 'MagicBaseApi':
        """Get MagicBase API instance"""
        return self._fetched_definitions['magicbase']

    @property
    def message_schedule(self) -> 'MessageScheduleApi':
        """Get message schedule API instance"""
        return self._fetched_definitions['message_schedule']

    @property
    def oauth2_callback_relay(self) -> 'OAuth2CallbackRelayApi':
        """获取 OAuth2 callback relay API 实例。"""
        return self._fetched_definitions['oauth2_callback_relay']

    @property
    def skill(self) -> 'SkillApi':
        """Get skill API instance"""
        return self._fetched_definitions['skill']

    @property
    def share(self) -> 'ShareApi':
        """Get share API instance"""
        return self._fetched_definitions['share']

    def get_host(self) -> str:
        """
        Get Magic Service host URL

        Returns:
            Host URL string
        """
        sdk_base = SdkContext.get(self.key)
        config = sdk_base.get_config()
        return config.get('base_url', '')

    def get_sdk_base(self) -> SdkBase:
        """
        Get underlying SdkBase instance

        Returns:
            SdkBase instance
        """
        return SdkContext.get(self.key)

    def close(self) -> None:
        """Close SDK resources"""
        sdk_base = SdkContext.get(self.key)
        if sdk_base:
            sdk_base.close()
        SdkContext.remove(self.key)

    def _register_apis(self, sdk_base: SdkBase) -> None:
        """
        Register all API instances

        Args:
            sdk_base: SdkBase instance
        """
        for route_name, api_class in self._routes.items():
            self._fetched_definitions[route_name] = api_class(sdk_base)

    def __enter__(self):
        """Context manager entry"""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.close()
