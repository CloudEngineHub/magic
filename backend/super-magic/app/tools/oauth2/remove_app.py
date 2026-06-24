"""删除 OAuth2 app 注册信息的 Code Mode 工具。"""

from __future__ import annotations

from pydantic import Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import ToolDetail
from app.i18n import i18n
from app.tools.core import BaseToolParams, tool
from app.tools.oauth2._base import BaseOAuth2Tool


class OAuth2RemoveAppParams(BaseToolParams):
    """删除 OAuth2 app 的参数。"""

    app_name: str = Field(..., description="""<!--zh: 要删除的 OAuth2 app_name。-->
OAuth2 app_name to remove.""")


@tool(name="oauth2_remove_app")
class OAuth2RemoveApp(BaseOAuth2Tool[OAuth2RemoveAppParams]):
    """<!--zh: 删除一个 OAuth2 app 及其本地授权数据。-->
    Remove an OAuth2 app registration and its local authorization data."""

    name = "oauth2_remove_app"

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: dict | None = None
    ) -> dict:
        """返回删除 OAuth2 app 前的展示文案。"""
        args = arguments or {}
        app_name = args.get("app_name", "")
        return {
            "action": i18n.translate("oauth2_remove_app", category="tool.actions"),
            "remark": i18n.translate("oauth2.remove_app.removing", category="tool.messages", app_name=app_name),
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
        """返回删除 OAuth2 app 后的展示文案。"""
        args = arguments or {}
        app_name = args.get("app_name", "")
        message_key = "oauth2.remove_app.removed" if result.ok else "oauth2.remove_app.failed"
        return {
            "action": i18n.translate("oauth2_remove_app", category="tool.actions"),
            "remark": i18n.translate(message_key, category="tool.messages", app_name=app_name),
            "tool_name": tool_name,
        }

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: dict | None = None
    ) -> ToolDetail | None:
        """返回删除 OAuth2 app 的工具详情。"""
        args = arguments or {}
        app_name = (result.extra_info or {}).get("app_name") or args.get("app_name", "")
        lines = [
            "# OAuth2 应用删除结果",
            "",
            f"- 状态: {'已删除' if result.ok else '删除失败'}",
            f"- app_name: `{app_name}`",
        ]
        if not result.ok:
            lines.append(f"- 错误: {self.user_error(result)}")
        return self.markdown_file("oauth2_remove_app.md", lines)

    async def execute(self, tool_context: ToolContext, params: OAuth2RemoveAppParams) -> ToolResult:
        """删除 app 注册信息、pending sessions 和已存储 credentials。"""
        try:
            removed = await self.app_registry().remove(params.app_name)
        except Exception as exc:
            return ToolResult.error(
                f"OAuth2 app removal failed: {exc}",
                extra_info={"app_name": params.app_name, "user_error": str(exc)},
            )
        if not removed:
            user_error = f"OAuth2 应用「{params.app_name}」不存在。"
            return ToolResult.error(
                f"OAuth2 app '{params.app_name}' was not found.",
                extra_info={"app_name": params.app_name, "user_error": user_error},
            )
        data = {"app_name": params.app_name}
        return ToolResult(
            content=(
                f"OAuth2 app '{params.app_name}' has been removed. "
                "Do not call sdk.oauth2.get_access_token for this app unless it is registered and authorized again."
            ),
            data=data,
            extra_info=data,
        )
