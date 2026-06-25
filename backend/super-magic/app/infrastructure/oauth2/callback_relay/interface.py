"""OAuth2 callback relay 接口。"""

from __future__ import annotations

from abc import ABC, abstractmethod

from app.infrastructure.oauth2.callback_relay.models import OAuth2CallbackResult


class OAuth2CallbackRelay(ABC):
    """所有 OAuth2 callback relay driver 需要实现的接口。"""

    @abstractmethod
    def get_redirect_uri(self, app_name: str) -> str:
        """返回 OAuth2 app 面向 provider 的 redirect URI。"""

    @abstractmethod
    async def fetch_callback(self, state: str) -> OAuth2CallbackResult:
        """根据 state 拉取 callback payload。"""

    @abstractmethod
    async def delete_callback(self, state: str) -> None:
        """删除已消费的 callback payload。"""
