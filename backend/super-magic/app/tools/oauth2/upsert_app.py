"""注册动态 OAuth2 app 的 Code Mode 工具。"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import ToolDetail
from app.i18n import i18n
from app.infrastructure.oauth2.app_definition import OAuth2AppDefinition
from app.tools.core import BaseToolParams, tool
from app.tools.oauth2._base import BaseOAuth2Tool


class OAuth2UpsertAppParams(BaseToolParams):
    """Parameters for registering an OAuth2 app."""

    app_name: str = Field(
        ...,
        description="Stable app name using lowercase letters, numbers, underscores, or hyphens.",
    )
    label_name: Optional[str] = Field(None, description="User-facing app label.")
    authorization_url: str = Field(..., description="OAuth2 authorization endpoint.")
    token_url: str = Field(..., description="OAuth2 token endpoint.")
    client_id: str = Field(..., description="OAuth2 client_id.")
    client_secret: Optional[str] = Field(
        None,
        description="OAuth2 client_secret or ${ENV_NAME} reference. Do not print this value.",
    )
    scope: str = Field("", description="OAuth2 scope from provider documentation.")
    refresh_url: Optional[str] = Field(None, description="Refresh-token endpoint. Defaults to token_url.")
    token_auth_method: Literal["client_secret_post", "client_secret_basic", "none"] = Field(
        "client_secret_post",
        description="Client authentication method for the token endpoint.",
    )
    token_content_type: Literal["application/x-www-form-urlencoded"] = Field(
        "application/x-www-form-urlencoded",
        description="Token request content type. Only standard form encoding is supported.",
    )


@tool(name="oauth2_upsert_app")
class OAuth2UpsertApp(BaseOAuth2Tool[OAuth2UpsertAppParams]):
    """Register or update an OAuth2 app definition without authorizing it."""

    name = "oauth2_upsert_app"

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: dict | None = None
    ) -> dict:
        """返回注册或更新 OAuth2 app 前的展示文案。"""
        args = arguments or {}
        app_name = args.get("app_name", "")
        return {
            "action": i18n.translate("oauth2_upsert_app", category="tool.actions"),
            "remark": i18n.translate("oauth2.upsert_app.upserting", category="tool.messages", app_name=app_name),
            "tool_name": tool_name,
        }

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: dict | None = None,
    ) -> dict:
        """返回注册或更新 OAuth2 app 后的展示文案。"""
        args = arguments or {}
        app_name = args.get("app_name", "")
        message_key = "oauth2.upsert_app.upserted" if result.ok else "oauth2.upsert_app.failed"
        return {
            "action": i18n.translate("oauth2_upsert_app", category="tool.actions"),
            "remark": i18n.translate(message_key, category="tool.messages", app_name=app_name),
            "tool_name": tool_name,
        }

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: dict | None = None
    ) -> ToolDetail | None:
        """返回注册或更新 OAuth2 app 的工具详情。"""
        args = arguments or {}
        app = (result.extra_info or {}).get("app") or {}
        app_name = app.get("app_name") or args.get("app_name", "")
        label_name = app.get("label_name") or args.get("label_name") or app_name
        if not result.ok:
            return self.markdown_file(
                "oauth2_upsert_app.md",
                [
                    "# OAuth2 应用保存结果",
                    "",
                    "- 状态: 保存失败",
                    f"- 应用: `{app_name}`",
                    f"- 错误: {self.user_error(result)}",
                ],
            )
        lines = [
            "# OAuth2 应用保存结果",
            "",
            "- 状态: 已保存",
            f"- 应用: {label_name}",
            f"- app_name: `{app_name}`",
            f"- scope: `{app.get('scope') or '-'}`",
            f"- 授权地址: `{app.get('authorization_url') or '-'}`",
            f"- Token 地址: `{app.get('token_url') or '-'}`",
            f"- Refresh 地址: `{app.get('refresh_url') or app.get('token_url') or '-'}`",
            f"- 重定向 URI: `{app.get('redirect_uri') or '-'}`",
            f"- 客户端密钥: {'已配置' if app.get('has_client_secret') else '未配置'}",
            "",
            "如果 OAuth2 平台要求配置重定向 URI 或白名单，请使用上面的地址。",
        ]
        return self.markdown_file("oauth2_upsert_app.md", lines)

    async def execute(self, tool_context: ToolContext, params: OAuth2UpsertAppParams) -> ToolResult:
        """注册或更新 app 定义。"""
        try:
            app = OAuth2AppDefinition(
                app_name=params.app_name,
                label_name=params.label_name or params.app_name,
                authorization_url=params.authorization_url,
                token_url=params.token_url,
                refresh_url=params.refresh_url or params.token_url,
                client_id=params.client_id,
                client_secret_ref=params.client_secret or "",
                scope=params.scope or "",
                token_auth_method=params.token_auth_method,
                token_content_type=params.token_content_type,
            )
            saved = await self.app_registry().save(app, self.resolve_timezone(tool_context))
        except Exception as exc:
            return ToolResult.error(
                f"OAuth2 app registration failed: {exc}",
                extra_info={
                    "app": {"app_name": params.app_name, "label_name": params.label_name or params.app_name},
                    "user_error": str(exc),
                },
            )

        redirect_uri = self.token_service().get_redirect_uri(saved.app_name)
        public_app = saved.to_public_dict()
        public_app["redirect_uri"] = redirect_uri
        data = {"app": public_app}
        return ToolResult(
            content=(
                f"OAuth2 app '{saved.app_name}' has been registered. "
                f"Tell the user to configure this redirect URI in the OAuth2 app if the provider "
                f"requires a redirect URI or allowlist value: {redirect_uri}. "
                "After the redirect URI is configured, call oauth2_start_authorization before calling "
                "sdk.oauth2.get_access_token()."
            ),
            data=data,
            extra_info=data,
        )
