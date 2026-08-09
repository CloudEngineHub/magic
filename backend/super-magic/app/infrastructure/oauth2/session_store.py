"""OAuth2 授权 session 的文件存储。"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.infrastructure.oauth2.security import hash_text
from app.infrastructure.oauth2.storage_paths import OAuth2StoragePaths
from app.infrastructure.oauth2.time_utils import format_timezone, utc_timestamp
from app.utils.async_file_utils import (
    async_exists,
    async_mkdir,
    async_read_json,
    async_scandir,
    async_unlink,
    async_write_json,
)

OAUTH2_AUTHORIZATION_SESSION_TTL_SECONDS = 600


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
        await self._collect_active_sessions(self._paths.app_dir(session.app_name) / "sessions")
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
        for session in await self._collect_active_sessions(sessions_dir):
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

    async def collect_active_state_hashes(self) -> set[str]:
        """清理所有 app 的过期 session，并返回仍有效的 state hash。"""
        root = self._paths.list_root()
        if not await async_exists(root):
            return set()

        active_hashes: set[str] = set()
        for app_entry in await async_scandir(root):
            if app_entry.is_symlink() or not app_entry.is_dir(follow_symlinks=False):
                continue
            sessions_dir = Path(app_entry.path) / "sessions"
            await self._collect_active_sessions(sessions_dir, active_hashes)
        return active_hashes

    async def _collect_active_sessions(
        self,
        sessions_dir: Path,
        active_hashes: set[str] | None = None,
    ) -> list[OAuth2AuthorizationSession]:
        if not await async_exists(sessions_dir):
            return []

        now = utc_timestamp()
        sessions: list[OAuth2AuthorizationSession] = []
        entries = sorted(
            await async_scandir(sessions_dir),
            key=lambda item: item.name,
            reverse=True,
        )
        for entry in entries:
            if entry.is_symlink() or not entry.is_file(follow_symlinks=False):
                continue
            if not entry.name.endswith(".json"):
                continue
            file_path = sessions_dir / entry.name
            try:
                session = OAuth2AuthorizationSession.from_dict(await async_read_json(file_path))
            except Exception:
                continue
            if session.expires_at <= now:
                await async_unlink(file_path)
                continue
            sessions.append(session)
            if active_hashes is not None:
                active_hashes.add(Path(entry.name).stem)
        return sessions


def create_authorization_session(
    *,
    app_name: str,
    subject: str,
    state: str,
    redirect_uri: str,
    code_verifier: str,
    auth_url: str,
    ttl_seconds: int = OAUTH2_AUTHORIZATION_SESSION_TTL_SECONDS,
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
