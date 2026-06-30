"""基于本地文件的 OAuth2 callback relay driver。"""

from __future__ import annotations

import os
from pathlib import Path

from app.infrastructure.oauth2.callback_relay.interface import OAuth2CallbackRelay
from app.infrastructure.oauth2.callback_relay.models import (
    OAuth2CallbackPayload,
    OAuth2CallbackResult,
    OAuth2CallbackStatus,
)
from app.infrastructure.oauth2.security import hash_text
from app.infrastructure.oauth2.time_utils import format_utc
from app.path_manager import PathManager
from app.utils.async_file_utils import async_exists, async_mkdir, async_read_json, async_unlink, async_write_json

ENV_LOCAL_REDIRECT_URI = "OAUTH2_LOCAL_CALLBACK_REDIRECT_URI"


class LocalOAuth2CallbackRelay(OAuth2CallbackRelay):
    """将 OAuth2 callback payload 作为临时 JSON 文件存储在 .runtime 下。"""

    def __init__(self, root_dir: Path | None = None) -> None:
        """使用可选 runtime 根目录初始化本地 callback relay。"""
        self._root_dir = root_dir or PathManager.get_runtime_dir() / "oauth2" / "callback_relay" / "local"

    @property
    def callbacks_dir(self) -> Path:
        """返回存储 callback JSON 文件的目录。"""
        return self._root_dir / "callbacks"

    def get_redirect_uri(self, app_name: str) -> str:
        """返回本地开发使用的 redirect URI。"""
        configured = os.getenv(ENV_LOCAL_REDIRECT_URI, "").strip()
        if configured:
            return configured
        port = os.getenv("SUPER_MAGIC_API_PORT", "8002")
        return f"http://127.0.0.1:{port}/api/dev/oauth2/callback"

    async def save_callback(self, payload: OAuth2CallbackPayload) -> None:
        """为本地开发持久化单个 callback payload。"""
        if not payload.state:
            raise ValueError("state is required.")
        payload.received_at = payload.received_at or format_utc()
        payload.source = payload.source or "local"
        file_path = self._callback_file(payload.state)
        await async_mkdir(file_path.parent, parents=True, exist_ok=True)
        await async_write_json(file_path, payload.to_dict(), ensure_ascii=False, indent=2)

    async def fetch_callback(self, state: str) -> OAuth2CallbackResult:
        """从本地 runtime 存储中按 state 拉取 callback payload。"""
        file_path = self._callback_file(state)
        if not await async_exists(file_path):
            return OAuth2CallbackResult(status=OAuth2CallbackStatus.PENDING, message="Callback has not arrived.")
        try:
            payload = OAuth2CallbackPayload.from_dict(await async_read_json(file_path))
        except Exception as exc:
            return OAuth2CallbackResult(status=OAuth2CallbackStatus.FAILED, message=f"Callback payload is invalid: {exc}")
        if payload.state != state:
            return OAuth2CallbackResult(status=OAuth2CallbackStatus.FAILED, message="Callback state does not match.")
        if payload.error:
            return OAuth2CallbackResult(status=OAuth2CallbackStatus.DENIED, payload=payload, message=payload.error)
        if not payload.code:
            return OAuth2CallbackResult(status=OAuth2CallbackStatus.FAILED, payload=payload, message="Callback code is missing.")
        return OAuth2CallbackResult(status=OAuth2CallbackStatus.RECEIVED, payload=payload)

    async def delete_callback(self, state: str) -> None:
        """删除已消费的 callback payload。"""
        file_path = self._callback_file(state)
        if await async_exists(file_path):
            await async_unlink(file_path)

    def _callback_file(self, state: str) -> Path:
        """返回单个 state 对应的 callback 文件路径。"""
        return self.callbacks_dir / f"{hash_text(state)}.json"
