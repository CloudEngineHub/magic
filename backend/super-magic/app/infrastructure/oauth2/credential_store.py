"""OAuth2 credential 的文件存储。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.infrastructure.oauth2.security import hash_text
from app.infrastructure.oauth2.storage_paths import OAuth2StoragePaths
from app.infrastructure.oauth2.time_utils import format_timezone, utc_timestamp
from app.utils.async_file_utils import async_exists, async_mkdir, async_read_json, async_unlink, async_write_json


@dataclass(slots=True)
class OAuth2Credential:
    """单个 app 和 subject 对应的 OAuth2 token 凭证。"""

    app_name: str
    subject: str
    access_token: str
    refresh_token: str = ""
    token_type: str = "Bearer"
    scope: str = ""
    expires_at: int = 0
    timezone: str = ""
    created_at: str = ""
    updated_at: str = ""
    raw_token: dict[str, Any] | None = None

    def is_valid(self, leeway_seconds: int = 60) -> bool:
        """判断 access token 是否无需刷新即可使用。"""
        return bool(self.access_token) and (not self.expires_at or self.expires_at > utc_timestamp() + leeway_seconds)

    def to_dict(self) -> dict[str, Any]:
        """序列化 credential 用于本地持久化。"""
        return {
            "app_name": self.app_name,
            "subject": self.subject,
            "access_token": self.access_token,
            "refresh_token": self.refresh_token,
            "token_type": self.token_type,
            "scope": self.scope,
            "expires_at": self.expires_at,
            "timezone": self.timezone,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "raw_token": self.raw_token or {},
        }

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "OAuth2Credential":
        """从 JSON 兼容字典创建 credential。"""
        return cls(**payload)

    @classmethod
    def from_token(
        cls,
        app_name: str,
        subject: str,
        token: dict[str, Any],
        timezone_name: str = "UTC",
    ) -> "OAuth2Credential":
        """根据 OAuth2 token 响应创建 credential。"""
        now = format_timezone(timezone_name=timezone_name)
        expires_at = int(token.get("expires_at") or 0)
        if not expires_at and token.get("expires_in"):
            expires_at = utc_timestamp() + int(token["expires_in"])
        return cls(
            app_name=app_name,
            subject=subject,
            access_token=str(token.get("access_token") or ""),
            refresh_token=str(token.get("refresh_token") or ""),
            token_type=str(token.get("token_type") or "Bearer"),
            scope=str(token.get("scope") or ""),
            expires_at=expires_at,
            timezone=timezone_name or "UTC",
            created_at=now,
            updated_at=now,
            raw_token=token,
        )


class OAuth2CredentialStore:
    """按 app 和 subject hash 持久化 OAuth2 credentials。"""

    def __init__(self, paths: OAuth2StoragePaths | None = None) -> None:
        """使用可选路径解析器初始化 credential 存储。"""
        self._paths = paths or OAuth2StoragePaths()

    async def save(self, credential: OAuth2Credential, timezone_name: str | None = None) -> None:
        """持久化单个 OAuth2 credential。"""
        if timezone_name:
            credential.timezone = timezone_name
        credential.updated_at = format_timezone(timezone_name=credential.timezone or timezone_name or "UTC")
        file_path = self._paths.credential_file(credential.app_name, hash_text(credential.subject))
        await async_mkdir(file_path.parent, parents=True, exist_ok=True)
        await async_write_json(file_path, credential.to_dict(), ensure_ascii=False, indent=2)

    async def get(self, app_name: str, subject: str) -> OAuth2Credential | None:
        """加载单个 OAuth2 credential。"""
        file_path = self._paths.credential_file(app_name, hash_text(subject))
        if not await async_exists(file_path):
            return None
        return OAuth2Credential.from_dict(await async_read_json(file_path))

    async def delete(self, app_name: str, subject: str) -> bool:
        """删除单个 OAuth2 credential。"""
        file_path = self._paths.credential_file(app_name, hash_text(subject))
        if not await async_exists(file_path):
            return False
        await async_unlink(file_path)
        return True
