"""发起 OAuth2 授权的 Code Mode 工具。"""

from __future__ import annotations

from pydantic import Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import ToolDetail
from app.i18n import i18n
from app.infrastructure.oauth2.time_utils import format_timestamp
from app.tools.core import BaseToolParams, tool
from app.tools.oauth2._base import BaseOAuth2Tool


class OAuth2StartAuthorizationParams(BaseToolParams):
    """Parameters for starting OAuth2 authorization."""

    app_name: str = Field(..., description="Registered OAuth2 app name to authorize.")


@tool(name="oauth2_start_authorization")
class OAuth2StartAuthorization(BaseOAuth2Tool[OAuth2StartAuthorizationParams]):
    """Generate an OAuth2 authorization URL and create a pending session."""

    name = "oauth2_start_authorization"

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: dict | None = None
    ) -> dict:
        """返回发起 OAuth2 授权前的展示文案。"""
        args = arguments or {}
        app_name = args.get("app_name", "")
        return {
            "action": i18n.translate("oauth2_start_authorization", category="tool.actions"),
            "remark": i18n.translate(
                "oauth2.start_authorization.starting", category="tool.messages", app_name=app_name
            ),
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
        """返回发起 OAuth2 授权后的展示文案。"""
        args = arguments or {}
        app_name = args.get("app_name", "")
        message_key = "oauth2.start_authorization.started" if result.ok else "oauth2.start_authorization.failed"
        return {
            "action": i18n.translate("oauth2_start_authorization", category="tool.actions"),
            "remark": i18n.translate(message_key, category="tool.messages", app_name=app_name),
            "tool_name": tool_name,
        }

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: dict | None = None
    ) -> ToolDetail | None:
        """返回发起 OAuth2 授权的工具详情。"""
        args = arguments or {}
        info = result.extra_info or {}
        app_name = info.get("app_name") or args.get("app_name", "")
        if not result.ok:
            return self.markdown_file(
                "oauth2_authorization.md",
                [
                    "# OAuth2 授权链接",
                    "",
                    "- 状态: 生成失败",
                    f"- app_name: `{app_name}`",
                    f"- 错误: {self.user_error(result)}",
                ],
            )
        lines = [
            "# OAuth2 授权链接",
            "",
            "- 状态: 待用户授权",
            f"- app_name: `{app_name}`",
            f"- 授权链接: {info.get('auth_url') or '-'}",
            f"- 过期时间: {info.get('expires_at') or '-'}",
            f"- 重定向 URI: `{info.get('redirect_uri') or '-'}`",
            f"- 自动检查: {self._auto_checking_label(info)}",
            "",
            "请打开授权链接并完成授权。授权完成后，"
            "系统会自动检查授权状态并保存凭证。",
        ]
        return self.markdown_file("oauth2_authorization.md", lines)

    async def execute(self, tool_context: ToolContext, params: OAuth2StartAuthorizationParams) -> ToolResult:
        """发起 OAuth2 授权流程。"""
        subject = self.resolve_subject(tool_context)
        timezone_name = self.resolve_timezone(tool_context)
        try:
            result = await self.token_service().start_authorization(params.app_name, subject, timezone_name)
        except Exception as exc:
            return ToolResult.error(
                f"OAuth2 authorization could not be started: {exc}",
                extra_info={"app_name": params.app_name, "user_error": str(exc)},
            )

        expires_at = format_timestamp(result.expires_at, timezone_name)
        data = {
            "app_name": result.app_name,
            "auth_url": result.auth_url,
            "state_hash": result.state_hash,
            "expires_at": expires_at,
            "redirect_uri": result.redirect_uri,
            "auto_checking": result.auto_checking,
            "auto_check_interval_seconds": result.auto_check_interval_seconds,
        }
        return ToolResult(
            content=(
                f"OAuth2 authorization started for '{result.app_name}'.\n"
                f"Share this authorization URL with the user:\n{result.auth_url}\n"
                f"The authorization session expires at {expires_at}. "
                "The system is checking the authorization callback in the background. "
                "Only call oauth2_check_authorization if you need to confirm the current status or recover manually."
            ),
            data=data,
            extra_info=data,
        )

    @staticmethod
    def _auto_checking_label(info: dict) -> str:
        """返回自动检查状态的展示文本。"""
        if not info.get("auto_checking"):
            return "未启动，请使用 oauth2_check_authorization 手动检查"
        interval = info.get("auto_check_interval_seconds") or "-"
        return f"已启动，每 {interval} 秒检查一次"
