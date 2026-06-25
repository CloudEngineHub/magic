"""OAuth2 授权 session 的文件存储。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.infrastructure.oauth2.security import hash_text
from app.infrastructure.oauth2.storage_paths import OAuth2StoragePaths
from app.infrastructure.oauth2.time_utils import format_timezone, utc_timestamp
from app.utils.async_file_utils import async_exists, async_mkdir, async_read_json, async_scandir, async_unlink, async_write_json


@dataclass(slots=True)
class OAuth2AuthorizationSession:
    """等待 callback 消费前持久化的 OAuth2 授权状态。"""

    app_name: str
    subject: str
    state: str
    redirect_uri: str
    code_verifier: str
    auth_url: str
    expires_at: int
    created_at: str

    def to_dict(self) -> dict[str, Any]:
        """序列化授权 session 用于本地持久化。"""
        return {
            "app_name": self.app_name,
            "subject": self.subject,
            "state": self.state,
            "redirect_uri": self.redirect_uri,
            "code_verifier": self.code_verifier,
            "auth_url": self.auth_url,
            "expires_at": self.expires_at,
            "created_at": self.created_at,
        }

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "OAuth2AuthorizationSession":
        """从 JSON 兼容字典创建授权 session。"""
        return cls(**payload)


class OAuth2SessionStore:
    """按 state hash 持久化 pending OAuth2 授权 session。"""

    def __init__(self, paths: OAuth2StoragePaths | None = None) -> None:
        """使用可选路径解析器初始化 session 存储。"""
        self._paths = paths or OAuth2StoragePaths()

    async def save(self, session: OAuth2AuthorizationSession) -> None:
        """持久化单个 pending 授权 session。"""
        file_path = self._paths.session_file(session.app_name, hash_text(session.state))
        await async_mkdir(file_path.parent, parents=True, exist_ok=True)
        await async_write_json(file_path, session.to_dict(), ensure_ascii=False, indent=2)

    async def get(self, app_name: str, state: str) -> OAuth2AuthorizationSession | None:
        """根据 state 加载 pending 授权 session。"""
        file_path = self._paths.session_file(app_name, hash_text(state))
        if not await async_exists(file_path):
            return None
        return OAuth2AuthorizationSession.from_dict(await async_read_json(file_path))

    async def find_latest(self, app_name: str, subject: str) -> OAuth2AuthorizationSession | None:
        """查找单个 app 和 subject 下最新的 pending 授权 session。"""
        sessions_dir = self._paths.app_dir(app_name) / "sessions"
        if not await async_exists(sessions_dir):
            return None

        matches: list[OAuth2AuthorizationSession] = []
        for entry in sorted(await async_scandir(sessions_dir), key=lambda item: item.name, reverse=True):
            if not entry.name.endswith(".json"):
                continue
            try:
                session = OAuth2AuthorizationSession.from_dict(await async_read_json(sessions_dir / entry.name))
            except Exception:
                continue
            if session.subject == subject:
                matches.append(session)
        if not matches:
            return None
        return max(matches, key=lambda item: item.expires_at)

    async def delete(self, app_name: str, state: str) -> None:
        """删除 pending 授权 session。"""
        file_path = self._paths.session_file(app_name, hash_text(state))
        if await async_exists(file_path):
            await async_unlink(file_path)

    async def is_expired(self, session: OAuth2AuthorizationSession) -> bool:
        """判断 pending session 是否已过期。"""
        return session.expires_at <= utc_timestamp()


def create_authorization_session(
    *,
    app_name: str,
    subject: str,
    state: str,
    redirect_uri: str,
    code_verifier: str,
    auth_url: str,
    ttl_seconds: int = 600,
    timezone_name: str = "UTC",
) -> OAuth2AuthorizationSession:
    """创建 pending OAuth2 授权 session。"""
    return OAuth2AuthorizationSession(
        app_name=app_name,
        subject=subject,
        state=state,
        redirect_uri=redirect_uri,
        code_verifier=code_verifier,
        auth_url=auth_url,
        expires_at=utc_timestamp() + ttl_seconds,
        created_at=format_timezone(timezone_name=timezone_name),
    )
