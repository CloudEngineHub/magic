"""基于 magic-service 的 OAuth2 callback relay driver。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from agentlang.logger import get_logger

from app.infrastructure.magic_service.exceptions import ConfigurationError
from app.infrastructure.oauth2.callback_relay.interface import OAuth2CallbackRelay
from app.infrastructure.oauth2.callback_relay.models import (
    OAuth2CallbackPayload,
    OAuth2CallbackResult,
    OAuth2CallbackStatus,
)
from app.infrastructure.sdk.magic_service.api.oauth2_callback_relay_api import DEFAULT_OAUTH2_CALLBACK_RELAY_PATH
from app.infrastructure.sdk.magic_service.factory import create_magic_service_sdk
from app.infrastructure.sdk.magic_service.parameter.oauth2_callback_relay_parameter import OAuth2CallbackRelayParameter
from app.utils.init_client_message_util import InitClientMessageUtil, InitializationError

logger = get_logger(__name__)

DEFAULT_RELAY_PATH = DEFAULT_OAUTH2_CALLBACK_RELAY_PATH
DEFAULT_TIMEOUT_SECONDS = 30


@dataclass(frozen=True, slots=True)
class MagicServiceCallbackRelayConfig:
    """magic-service callback relay 的 HTTP 配置。"""

    base_url: str
    redirect_uri: str
    relay_path: str = DEFAULT_RELAY_PATH
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS


class MagicServiceOAuth2CallbackRelay(OAuth2CallbackRelay):
    """通过 magic-service 公网中转 OAuth2 callback payload。"""

    def __init__(self, config: MagicServiceCallbackRelayConfig | None = None) -> None:
        """使用显式配置或 init_client_message 初始化 magic-service relay driver。"""
        self._config = config or self._load_config()
        self._magic_service = create_magic_service_sdk(
            base_url=self._config.base_url,
            timeout=self._config.timeout_seconds,
        )

    def get_redirect_uri(self, app_name: str) -> str:
        """返回配置到 OAuth2 provider 侧的公网 redirect URI。"""
        return self._config.redirect_uri

    async def fetch_callback(self, state: str) -> OAuth2CallbackResult:
        """从 magic-service 按 state 拉取已暂存的 OAuth2 callback payload。"""
        if not state:
            return OAuth2CallbackResult(status=OAuth2CallbackStatus.FAILED, message="Callback state is required.")

        try:
            result = await self._magic_service.oauth2_callback_relay.fetch_callback_async(
                OAuth2CallbackRelayParameter(state=state, timeout=self._config.timeout_seconds),
                endpoint_path=self._build_operation_path(self._config.relay_path, "fetch-callback"),
            )
        except Exception as exc:
            logger.warning(f"OAuth2 magic-service callback relay fetch failed: {exc}")
            return OAuth2CallbackResult(status=OAuth2CallbackStatus.FAILED, message=str(exc))

        return self._parse_callback_result(result.to_dict(), expected_state=state)

    async def delete_callback(self, state: str) -> None:
        """通知 magic-service 删除已消费的 OAuth2 callback payload。"""
        if not state:
            return
        try:
            await self._magic_service.oauth2_callback_relay.delete_callback_async(
                OAuth2CallbackRelayParameter(state=state, timeout=self._config.timeout_seconds),
                endpoint_path=self._build_operation_path(self._config.relay_path, "delete-callback"),
            )
        except Exception as exc:
            logger.warning(f"OAuth2 magic-service callback relay delete failed: {exc}")

    @classmethod
    def _load_config(cls) -> MagicServiceCallbackRelayConfig:
        """只从 init_client_message 加载 magic-service relay 配置。"""
        try:
            base_url = InitClientMessageUtil.get_magic_service_host().strip()
        except InitializationError as exc:
            raise ConfigurationError(
                f"OAuth2 magic-service callback relay base URL is unavailable from init_client_message: {exc}"
            ) from exc

        if not base_url:
            raise ConfigurationError("OAuth2 magic-service callback relay base URL is empty.")

        relay_path = DEFAULT_RELAY_PATH
        timeout_seconds = DEFAULT_TIMEOUT_SECONDS
        redirect_uri = cls._join_url(base_url, relay_path)

        return MagicServiceCallbackRelayConfig(
            base_url=base_url,
            redirect_uri=redirect_uri,
            relay_path=relay_path,
            timeout_seconds=timeout_seconds,
        )

    def _parse_callback_result(self, body: dict[str, Any], expected_state: str) -> OAuth2CallbackResult:
        """将 magic-service data 转换成标准 callback relay 结果。"""
        data = body
        status = self._parse_status(data.get("status"))
        payload = self._parse_payload(data)
        message = str(data.get("message") or "")

        if status == OAuth2CallbackStatus.PENDING:
            return OAuth2CallbackResult(status=status, message=message or "Callback has not arrived.")
        if status == OAuth2CallbackStatus.EXPIRED:
            return OAuth2CallbackResult(status=status, payload=payload, message=message or "Callback payload has expired.")
        if payload is None:
            return OAuth2CallbackResult(status=OAuth2CallbackStatus.FAILED, message=message or "Callback payload is missing.")
        if payload.state != expected_state:
            return OAuth2CallbackResult(status=OAuth2CallbackStatus.FAILED, payload=payload, message="Callback state does not match.")
        if payload.error:
            return OAuth2CallbackResult(status=OAuth2CallbackStatus.DENIED, payload=payload, message=payload.error_description or payload.error)
        if status == OAuth2CallbackStatus.RECEIVED and not payload.code:
            return OAuth2CallbackResult(status=OAuth2CallbackStatus.FAILED, payload=payload, message="Callback code is missing.")
        return OAuth2CallbackResult(status=status, payload=payload, message=message)

    @staticmethod
    def _build_operation_path(relay_path: str, operation: str) -> str:
        """基于重定向接收路径生成内部操作接口路径。"""
        return f"{relay_path.rstrip('/')}/{operation}"

    @staticmethod
    def _parse_payload(data: dict[str, Any]) -> OAuth2CallbackPayload | None:
        """从返回数据中解析 callback payload。"""
        raw_payload = data.get("payload")
        if raw_payload is None:
            return None
        if not isinstance(raw_payload, dict):
            raise RuntimeError("Callback payload must be an object.")
        return OAuth2CallbackPayload.from_dict(raw_payload)

    @staticmethod
    def _parse_status(value: Any) -> OAuth2CallbackStatus:
        """解析 callback 状态，未知状态按 failed 处理。"""
        try:
            return OAuth2CallbackStatus(str(value or OAuth2CallbackStatus.RECEIVED.value))
        except ValueError:
            return OAuth2CallbackStatus.FAILED

    @staticmethod
    def _join_url(base_url: str, path: str) -> str:
        """拼接 base URL 和 path，避免重复或缺失斜杠。"""
        return f"{base_url.rstrip('/')}/{path.lstrip('/')}"
