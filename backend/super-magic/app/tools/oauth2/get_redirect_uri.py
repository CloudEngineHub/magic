"""获取 OAuth2 重定向 URI 的 Code Mode 工具。"""

from __future__ import annotations

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import ToolDetail
from app.i18n import i18n
from app.tools.core import BaseToolParams, tool
from app.tools.oauth2._base import BaseOAuth2Tool


class OAuth2GetRedirectUriParams(BaseToolParams):
    """Parameters for reading the OAuth2 redirect URI."""


@tool(name="oauth2_get_redirect_uri")
class OAuth2GetRedirectUri(BaseOAuth2Tool[OAuth2GetRedirectUriParams]):
    """Get the provider-side OAuth2 redirect URI when the user requests it."""

    name = "oauth2_get_redirect_uri"

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: dict | None = None
    ) -> dict:
        """返回获取 OAuth2 重定向 URI 前的展示文案。"""
        return {
            "action": i18n.translate("oauth2_get_redirect_uri", category="tool.actions"),
            "remark": i18n.translate("oauth2.get_redirect_uri.getting", category="tool.messages"),
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
        """返回获取 OAuth2 重定向 URI 后的展示文案。"""
        message_key = "oauth2.get_redirect_uri.got" if result.ok else "oauth2.get_redirect_uri.failed"
        return {
            "action": i18n.translate("oauth2_get_redirect_uri", category="tool.actions"),
            "remark": i18n.translate(message_key, category="tool.messages"),
            "tool_name": tool_name,
        }

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: dict | None = None
    ) -> ToolDetail | None:
        """返回 OAuth2 重定向 URI 的工具详情。"""
        info = result.extra_info or {}
        if not result.ok:
            return self.markdown_file(
                "oauth2_redirect_uri.md",
                [
                    "# OAuth2 重定向 URI",
                    "",
                    "- 状态: 获取失败",
                    f"- 错误: {self.user_error(result)}",
                ],
            )

        redirect_uri = info.get("redirect_uri") or "-"
        lines = [
            "# OAuth2 重定向 URI",
            "",
            "- 状态: 已获取",
            f"- 重定向 URI: `{redirect_uri}`",
            "",
            "如果 OAuth2 平台要求配置重定向 URI 或白名单，请使用上面的地址。",
        ]
        return self.markdown_file("oauth2_redirect_uri.md", lines)

    async def execute(self, tool_context: ToolContext, params: OAuth2GetRedirectUriParams) -> ToolResult:
        """获取 OAuth2 平台侧需要配置的重定向 URI。"""
        try:
            redirect_uri = self.token_service().get_redirect_uri()
        except Exception as exc:
            return ToolResult.error(
                f"OAuth2 redirect URI could not be resolved: {exc}",
                extra_info={"user_error": str(exc)},
            )

        data = {
            "redirect_uri": redirect_uri,
        }
        return ToolResult(
            content=(
                f"The OAuth2 redirect URI is: {redirect_uri}. "
                "Only share it when the user explicitly asks for the redirect URI or provider-side allowlist value."
            ),
            data=data,
            extra_info=data,
        )
