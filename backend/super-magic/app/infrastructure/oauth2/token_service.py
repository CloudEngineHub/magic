"""OAuth2 授权和 token 生命周期服务。"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import ClassVar

from agentlang.logger import get_logger
from app.infrastructure.oauth2.app_registry import OAuth2AppRegistry
from app.infrastructure.oauth2.callback_relay.factory import create_callback_relay
from app.infrastructure.oauth2.callback_relay.interface import OAuth2CallbackRelay
from app.infrastructure.oauth2.callback_relay.models import OAuth2CallbackStatus
from app.infrastructure.oauth2.credential_store import OAuth2Credential, OAuth2CredentialStore
from app.infrastructure.oauth2.exceptions import (
    OAuth2AuthorizationRequiredError,
    OAuth2ConfigurationError,
    OAuth2TokenRefreshError,
)
from app.infrastructure.oauth2.security import (
    get_env_placeholder_name,
    make_pkce_challenge,
    make_pkce_verifier,
    make_state,
    redact,
    resolve_secret,
)
from app.infrastructure.oauth2.session_store import (
    OAuth2AuthorizationSession,
    OAuth2SessionStore,
    create_authorization_session,
)
from app.infrastructure.oauth2.time_utils import format_timestamp
from app.infrastructure.oauth2.token_client import AuthlibOAuth2TokenClient, OAuth2TokenClient

logger = get_logger(__name__)

AUTO_AUTHORIZATION_POLL_INTERVAL_SECONDS = 2


@dataclass(slots=True)
class OAuth2AuthorizationStartResult:
    """创建 pending 授权 session 后返回的结果。"""

    app_name: str
    auth_url: str
    state_hash: str
    expires_at: int
    redirect_uri: str
    auto_checking: bool = False
    auto_check_interval_seconds: float = 0


@dataclass(slots=True)
class OAuth2AuthorizationCheckResult:
    """检查授权 callback 后返回的结果。"""

    status: str
    app_name: str
    subject: str
    message: str


class OAuth2TokenService:
    """编排 app 注册表、callback relay、token client 和 credential 存储。"""

    _authorization_poll_tasks: ClassVar[dict[str, asyncio.Task]] = {}

    def __init__(
        self,
        *,
        app_registry: OAuth2AppRegistry | None = None,
        session_store: OAuth2SessionStore | None = None,
        credential_store: OAuth2CredentialStore | None = None,
        callback_relay: OAuth2CallbackRelay | None = None,
        token_client: OAuth2TokenClient | None = None,
    ) -> None:
        """初始化 OAuth2 token 生命周期服务。"""
        self._app_registry = app_registry or OAuth2AppRegistry()
        self._session_store = session_store or OAuth2SessionStore()
        self._credential_store = credential_store or OAuth2CredentialStore()
        self._callback_relay = callback_relay or create_callback_relay()
        self._token_client = token_client or AuthlibOAuth2TokenClient()

    async def start_authorization(
        self,
        app_name: str,
        subject: str,
        timezone_name: str = "UTC",
    ) -> OAuth2AuthorizationStartResult:
        """创建 OAuth2 授权 URL 并持久化 pending session 状态。"""
        app = await self._app_registry.get(app_name)
        self._ensure_token_exchange_configuration(app)
        redirect_uri = self.get_redirect_uri(app.app_name)
        state = make_state()
        code_verifier = make_pkce_verifier()
        code_challenge = make_pkce_challenge(code_verifier)
        auth_url = self._token_client.create_authorization_url(
            app,
            redirect_uri=redirect_uri,
            state=state,
            code_challenge=code_challenge,
        )
        session = create_authorization_session(
            app_name=app.app_name,
            subject=subject,
            state=state,
            redirect_uri=redirect_uri,
            code_verifier=code_verifier,
            auth_url=auth_url,
            timezone_name=timezone_name,
        )
        await self._session_store.save(session)
        auto_checking = self._start_authorization_polling(session, timezone_name)
        return OAuth2AuthorizationStartResult(
            app_name=app.app_name,
            auth_url=auth_url,
            state_hash=redact(state),
            expires_at=session.expires_at,
            redirect_uri=redirect_uri,
            auto_checking=auto_checking,
            auto_check_interval_seconds=AUTO_AUTHORIZATION_POLL_INTERVAL_SECONDS if auto_checking else 0,
        )

    def get_redirect_uri(self, app_name: str = "") -> str:
        """返回当前需要配置到 OAuth2 平台的重定向 URI。"""
        return self._callback_relay.get_redirect_uri(app_name)

    async def check_authorization(
        self,
        app_name: str,
        subject: str,
        state: str | None = None,
        timezone_name: str = "UTC",
    ) -> OAuth2AuthorizationCheckResult:
        """拉取 callback payload，并用 authorization code 换取 credential。"""
        session = (
            await self._session_store.get(app_name, state)
            if state
            else await self._session_store.find_latest(app_name, subject)
        )
        if session is None:
            return await self._check_saved_authorization(app_name, subject)
        state = session.state
        if await self._session_store.is_expired(session):
            await self._delete_authorization_state(app_name, state)
            saved_result = await self._check_saved_authorization(app_name, subject)
            if saved_result.status != "not_authorized":
                return saved_result
            return OAuth2AuthorizationCheckResult(
                "authorization_expired",
                app_name,
                subject,
                "Authorization session expired.",
            )

        callback = await self._callback_relay.fetch_callback(state)
        if callback.status == OAuth2CallbackStatus.PENDING:
            return OAuth2AuthorizationCheckResult(
                "authorization_pending",
                app_name,
                subject,
                "Authorization callback has not arrived.",
            )
        if callback.status in {OAuth2CallbackStatus.DENIED, OAuth2CallbackStatus.FAILED, OAuth2CallbackStatus.EXPIRED}:
            await self._delete_authorization_state(app_name, state)
            return OAuth2AuthorizationCheckResult(callback.status.value, app_name, subject, callback.message)
        if callback.payload is None:
            await self._delete_authorization_state(app_name, state)
            return OAuth2AuthorizationCheckResult(
                "failed",
                app_name,
                subject,
                "Authorization callback payload is missing.",
            )

        app = await self._app_registry.get(app_name)
        token = await self._token_client.exchange_code(
            app,
            code=callback.payload.code,
            redirect_uri=session.redirect_uri,
            code_verifier=session.code_verifier,
        )
        credential = OAuth2Credential.from_token(app.app_name, session.subject or subject, token, timezone_name)
        await self._credential_store.save(credential, timezone_name)
        await self._delete_authorization_state(app.app_name, state)
        return OAuth2AuthorizationCheckResult(
            "authorized",
            app.app_name,
            credential.subject,
            "OAuth2 authorization completed.",
        )

    async def resolve_access_token(self, app_name: str, subject: str, timezone_name: str = "UTC") -> str:
        """返回可用 access token，必要时自动刷新。"""
        app = await self._app_registry.get(app_name)
        credential = await self._credential_store.get(app.app_name, subject)
        if credential is None:
            raise OAuth2AuthorizationRequiredError(f"OAuth2 app '{app.app_name}' is not authorized.")
        if credential.is_valid():
            return credential.access_token
        if not credential.refresh_token:
            raise OAuth2AuthorizationRequiredError(f"OAuth2 app '{app.app_name}' requires reauthorization.")

        token = await self._token_client.refresh_token(app, refresh_token=credential.refresh_token)
        refreshed = OAuth2Credential.from_token(app.app_name, subject, token, timezone_name)
        if not refreshed.refresh_token:
            refreshed.refresh_token = credential.refresh_token
        refreshed.created_at = credential.created_at
        refreshed.timezone = timezone_name or credential.timezone or "UTC"
        await self._credential_store.save(refreshed, refreshed.timezone)
        if not refreshed.access_token:
            raise OAuth2TokenRefreshError("OAuth2 refresh succeeded but no access token was returned.")
        return refreshed.access_token

    async def get_credential_status(self, app_name: str, subject: str) -> dict:
        """返回用于工具输出的脱敏 credential 状态。"""
        credential = await self._credential_store.get(app_name, subject)
        if credential is None:
            return {"status": "not_authorized"}
        return {
            "status": "authorized" if credential.is_valid() else "expired",
            "has_refresh_token": bool(credential.refresh_token),
            "expires_at": format_timestamp(credential.expires_at, credential.timezone or "UTC"),
        }

    async def _check_saved_authorization(self, app_name: str, subject: str) -> OAuth2AuthorizationCheckResult:
        """在没有 pending session 时返回已保存凭证的幂等检查结果。"""
        credential = await self._credential_store.get(app_name, subject)
        if credential is None:
            return OAuth2AuthorizationCheckResult(
                "not_authorized",
                app_name,
                subject,
                "OAuth2 app is not authorized and no pending authorization session exists.",
            )
        if credential.is_valid() or credential.refresh_token:
            return OAuth2AuthorizationCheckResult(
                "authorized",
                app_name,
                subject,
                "OAuth2 authorization has already completed.",
            )
        return OAuth2AuthorizationCheckResult(
            "expired",
            app_name,
            subject,
            "OAuth2 authorization exists but the saved token is expired and cannot be refreshed.",
        )

    async def _delete_authorization_state(self, app_name: str, state: str) -> None:
        """同步删除授权 session 与本地或远端 callback。"""
        await self._session_store.delete(app_name, state)
        await self._callback_relay.delete_callback(state)

    def _start_authorization_polling(self, session: OAuth2AuthorizationSession, timezone_name: str) -> bool:
        """为单个授权 session 启动后台轮询。"""
        task_key = self._authorization_poll_task_key(session.app_name, session.state)
        existing_task = type(self)._authorization_poll_tasks.get(task_key)
        if existing_task is not None and not existing_task.done():
            return True

        try:
            task = asyncio.create_task(
                self._poll_authorization_until_done(
                    app_name=session.app_name,
                    subject=session.subject,
                    state=session.state,
                    timezone_name=timezone_name,
                )
            )
        except RuntimeError as exc:
            logger.warning(f"OAuth2 authorization polling could not be started: {exc}")
            return False

        type(self)._authorization_poll_tasks[task_key] = task

        def _cleanup_finished_task(finished_task: asyncio.Task) -> None:
            """轮询结束后清理任务注册表，避免保留已完成任务。"""
            current_task = type(self)._authorization_poll_tasks.get(task_key)
            if current_task is finished_task:
                type(self)._authorization_poll_tasks.pop(task_key, None)

        task.add_done_callback(_cleanup_finished_task)
        return True

    @staticmethod
    def _ensure_token_exchange_configuration(app) -> None:
        """在生成授权链接前校验后续换 token 所需的客户端凭据。"""
        if app.token_auth_method == "none":
            return
        if not app.client_secret_ref:
            raise OAuth2ConfigurationError(
                "OAuth2 client_secret is required when token_auth_method is not 'none'."
            )
        if resolve_secret(app.client_secret_ref):
            return
        env_name = get_env_placeholder_name(app.client_secret_ref)
        if env_name:
            raise OAuth2ConfigurationError(
                f"OAuth2 client_secret references environment variable '{env_name}', "
                "but it is not available in the current process."
            )
        raise OAuth2ConfigurationError("OAuth2 client_secret is configured but unavailable.")

    async def _poll_authorization_until_done(
        self,
        *,
        app_name: str,
        subject: str,
        state: str,
        timezone_name: str,
    ) -> None:
        """在授权 session 有效期内持续轮询 callback 并自动换取 token。"""
        try:
            while True:
                session = await self._session_store.get(app_name, state)
                if session is None:
                    return
                if await self._session_store.is_expired(session):
                    await self.check_authorization(app_name, subject, state=state, timezone_name=timezone_name)
                    return

                await asyncio.sleep(AUTO_AUTHORIZATION_POLL_INTERVAL_SECONDS)
                result = await self.check_authorization(app_name, subject, state=state, timezone_name=timezone_name)

                if result.status != "authorization_pending":
                    logger.info(f"OAuth2 authorization polling finished for app={app_name}, status={result.status}")
                    return
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning(f"OAuth2 authorization polling failed for app={app_name}: {exc}")

    @staticmethod
    def _authorization_poll_task_key(app_name: str, state: str) -> str:
        """返回后台轮询任务使用的脱敏注册 key。"""
        return f"{app_name}:{redact(state)}"
