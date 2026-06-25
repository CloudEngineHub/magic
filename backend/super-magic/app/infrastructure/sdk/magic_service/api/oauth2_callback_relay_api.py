"""OAuth2 callback relay API。"""

from __future__ import annotations

from ..kernel.magic_service_api import MagicServiceAbstractApi
from ..parameter.oauth2_callback_relay_parameter import OAuth2CallbackRelayParameter
from ..result.oauth2_callback_relay_result import OAuth2CallbackRelayResult

DEFAULT_OAUTH2_CALLBACK_RELAY_PATH = "/api/v1/open-api/sandbox/oauth2/callback-relay"
DEFAULT_OAUTH2_CALLBACK_RELAY_FETCH_PATH = f"{DEFAULT_OAUTH2_CALLBACK_RELAY_PATH}/fetch-callback"
DEFAULT_OAUTH2_CALLBACK_RELAY_DELETE_PATH = f"{DEFAULT_OAUTH2_CALLBACK_RELAY_PATH}/delete-callback"


class OAuth2CallbackRelayApi(MagicServiceAbstractApi):
    """magic-service OAuth2 callback relay API。"""

    async def fetch_callback_async(
        self,
        parameter: OAuth2CallbackRelayParameter,
        endpoint_path: str = DEFAULT_OAUTH2_CALLBACK_RELAY_FETCH_PATH,
    ) -> OAuth2CallbackRelayResult:
        """按 state 从 magic-service 拉取 OAuth2 callback payload。"""
        data = await self.request_by_parameter_async(parameter, "GET", endpoint_path)
        return OAuth2CallbackRelayResult(data)

    async def delete_callback_async(
        self,
        parameter: OAuth2CallbackRelayParameter,
        endpoint_path: str = DEFAULT_OAUTH2_CALLBACK_RELAY_DELETE_PATH,
    ) -> OAuth2CallbackRelayResult:
        """按 state 删除 magic-service 中已消费的 OAuth2 callback payload。"""
        data = await self.request_by_parameter_async(parameter, "DELETE", endpoint_path)
        return OAuth2CallbackRelayResult(data)
