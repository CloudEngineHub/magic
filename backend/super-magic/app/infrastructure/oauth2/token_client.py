"""OAuth2 token client 实现。"""

from __future__ import annotations

import asyncio

from app.infrastructure.oauth2.app_definition import OAuth2AppDefinition
from app.infrastructure.oauth2.exceptions import (
    OAuth2DependencyError,
    OAuth2TokenExchangeError,
    OAuth2TokenRefreshError,
)
from app.infrastructure.oauth2.security import get_env_placeholder_name, resolve_secret


class OAuth2TokenClient:
    """OAuth2 授权 URL 与 token 操作接口。"""

    def create_authorization_url(
        self,
        app: OAuth2AppDefinition,
        *,
        redirect_uri: str,
        state: str,
        code_challenge: str,
    ) -> str:
        """创建 OAuth2 授权 URL。"""
        raise NotImplementedError

    async def exchange_code(
        self,
        app: OAuth2AppDefinition,
        *,
        code: str,
        redirect_uri: str,
        code_verifier: str,
    ) -> dict:
        """使用 authorization code 换取 OAuth2 token。"""
        raise NotImplementedError

    async def refresh_token(self, app: OAuth2AppDefinition, *, refresh_token: str) -> dict:
        """刷新 OAuth2 access token。"""
        raise NotImplementedError


class AuthlibOAuth2TokenClient(OAuth2TokenClient):
    """基于 Authlib 的 OAuth2 token client。"""

    def create_authorization_url(
        self,
        app: OAuth2AppDefinition,
        *,
        redirect_uri: str,
        state: str,
        code_challenge: str,
    ) -> str:
        """通过 Authlib OAuth2Session 创建授权 URL。"""
        OAuth2Session = self._load_session_class()
        session = OAuth2Session(client_id=app.client_id, scope=app.scope, redirect_uri=redirect_uri)
        url, _ = session.create_authorization_url(
            app.authorization_url,
            state=state,
            code_challenge=code_challenge,
            code_challenge_method="S256",
        )
        return str(url)

    async def exchange_code(
        self,
        app: OAuth2AppDefinition,
        *,
        code: str,
        redirect_uri: str,
        code_verifier: str,
    ) -> dict:
        """通过 Authlib 使用 authorization code 换取 token。"""
        try:
            return await asyncio.to_thread(self._exchange_code_sync, app, code, redirect_uri, code_verifier)
        except OAuth2DependencyError:
            raise
        except Exception as exc:
            raise OAuth2TokenExchangeError(f"OAuth2 token exchange failed: {exc}") from exc

    async def refresh_token(self, app: OAuth2AppDefinition, *, refresh_token: str) -> dict:
        """通过 Authlib 刷新 access token。"""
        try:
            return await asyncio.to_thread(self._refresh_token_sync, app, refresh_token)
        except OAuth2DependencyError:
            raise
        except Exception as exc:
            raise OAuth2TokenRefreshError(f"OAuth2 token refresh failed: {exc}") from exc

    def _exchange_code_sync(
        self,
        app: OAuth2AppDefinition,
        code: str,
        redirect_uri: str,
        code_verifier: str,
    ) -> dict:
        """同步执行 Authlib token 交换。"""
        OAuth2Session = self._load_session_class()
        client_secret = resolve_secret(app.client_secret_ref)
        if app.client_secret_ref and not client_secret:
            raise OAuth2TokenExchangeError(self._missing_client_secret_message(app.client_secret_ref))
        session = OAuth2Session(
            client_id=app.client_id,
            client_secret=client_secret or None,
            scope=app.scope,
            redirect_uri=redirect_uri,
            token_endpoint_auth_method=app.token_auth_method,
        )
        return dict(session.fetch_token(
            app.token_url,
            code=code,
            grant_type="authorization_code",
            code_verifier=code_verifier,
        ))

    def _refresh_token_sync(self, app: OAuth2AppDefinition, refresh_token: str) -> dict:
        """同步执行 Authlib token 刷新。"""
        OAuth2Session = self._load_session_class()
        client_secret = resolve_secret(app.client_secret_ref)
        if app.client_secret_ref and not client_secret:
            raise OAuth2TokenRefreshError(self._missing_client_secret_message(app.client_secret_ref))
        session = OAuth2Session(
            client_id=app.client_id,
            client_secret=client_secret or None,
            scope=app.scope,
            token_endpoint_auth_method=app.token_auth_method,
        )
        return dict(session.refresh_token(
            app.refresh_url or app.token_url,
            refresh_token=refresh_token,
        ))

    @staticmethod
    def _load_session_class():
        """懒加载 Authlib OAuth2Session，避免应用启动直接依赖该库。"""
        try:
            from authlib.integrations.requests_client import OAuth2Session
        except ImportError as exc:
            raise OAuth2DependencyError(
                "Authlib is required for OAuth2 support. Install dependencies from requirements_runtime.txt."
            ) from exc
        return OAuth2Session

    @staticmethod
    def _missing_client_secret_message(client_secret_ref: str) -> str:
        """返回不泄露密钥明文的 client_secret 缺失错误。"""
        env_name = get_env_placeholder_name(client_secret_ref)
        if env_name:
            return (
                f"OAuth2 client_secret references environment variable '{env_name}', "
                "but it is not available in the current process."
            )
        return "OAuth2 client_secret is configured but unavailable."
