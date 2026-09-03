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
    """Parameters for removing OAuth2 apps."""

    app_names: list[str] = Field(
        ...,
        description="OAuth2 app names to remove. Use a one-item list for one app.",
    )

    def target_app_names(self) -> list[str]:
        """返回归一化后的待删除 app_name 列表。"""
        return list(dict.fromkeys(item.strip() for item in self.app_names if item.strip()))


@tool(name="oauth2_remove_app")
class OAuth2RemoveApp(BaseOAuth2Tool[OAuth2RemoveAppParams]):
    """Remove OAuth2 app registrations and their local authorization data."""

    name = "oauth2_remove_app"

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: dict | None = None
    ) -> dict:
        """返回删除 OAuth2 app 前的展示文案。"""
        args = arguments or {}
        app_name = self._argument_label(args)
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
        app_name = self._argument_label(result.extra_info or args)
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
        info = result.extra_info or {}
        removed = info.get("removed") or []
        not_found = info.get("not_found") or []
        failed = info.get("failed") or []
        app_name = self._argument_label(info or args)
        lines = [
            "# OAuth2 应用删除结果",
            "",
            f"- 状态: {'已删除' if result.ok else '存在失败项'}",
            f"- app_name: `{app_name}`",
            f"- 删除成功: {len(removed)}",
            f"- 未找到: {len(not_found)}",
            f"- 删除失败: {len(failed)}",
        ]
        if removed:
            lines.extend(["", "## 删除成功", "", *[f"- `{item}`" for item in removed]])
        if not_found:
            lines.extend(["", "## 未找到", "", *[f"- `{item}`" for item in not_found]])
        if failed:
            lines.extend([
                "",
                "## 删除失败",
                "",
                *[f"- `{item.get('app_name')}`: {item.get('error')}" for item in failed],
            ])
        if not result.ok:
            lines.append(f"- 错误: {self.user_error(result)}")
        return self.markdown_file("oauth2_remove_app.md", lines)

    async def execute(self, tool_context: ToolContext, params: OAuth2RemoveAppParams) -> ToolResult:
        """删除一个或多个 app 注册信息、pending sessions 和已存储 credentials。"""
        app_names = params.target_app_names()
        if not app_names:
            user_error = "必须提供 app_names。"
            return ToolResult.error("app_names is required.", extra_info={"user_error": user_error})

        registry = self.app_registry()
        removed: list[str] = []
        not_found: list[str] = []
        failed: list[dict] = []
        for app_name in app_names:
            try:
                app_removed = await registry.remove(app_name)
            except Exception as exc:
                failed.append({"app_name": app_name, "error": str(exc)})
                continue
            if app_removed:
                removed.append(app_name)
            else:
                not_found.append(app_name)

        ok = not not_found and not failed
        user_error = self._build_user_error(not_found, failed)
        data = {
            "app_name": app_names[0] if len(app_names) == 1 else "",
            "app_names": app_names,
            "removed": removed,
            "not_found": not_found,
            "failed": failed,
            "user_error": user_error,
        }
        return ToolResult(
            ok=ok,
            content=self._build_content(removed, not_found, failed),
            data=data,
            extra_info=data,
        )

    @staticmethod
    def _argument_label(values: dict) -> str:
        """从工具入参或结果中生成 app_name 展示标签。"""
        app_names = values.get("app_names") or values.get("removed") or values.get("not_found") or []
        names = list(dict.fromkeys(str(item).strip() for item in app_names if str(item).strip()))
        return "、".join(names) if names else "-"

    @staticmethod
    def _build_user_error(not_found: list[str], failed: list[dict]) -> str:
        """构造批量删除失败时的用户可见错误摘要。"""
        parts: list[str] = []
        if not_found:
            parts.append(f"未找到: {', '.join(not_found)}")
        if failed:
            parts.append("删除失败: " + ", ".join(f"{item['app_name']}({item['error']})" for item in failed))
        return "；".join(parts)

    @staticmethod
    def _build_content(removed: list[str], not_found: list[str], failed: list[dict]) -> str:
        """构造批量删除结果给模型看的内容。"""
        lines = [
            "OAuth2 app removal completed.",
            f"Removed: {removed or []}",
            f"Not found: {not_found or []}",
            f"Failed: {failed or []}",
        ]
        if removed:
            lines.append("Do not call sdk.oauth2.get_access_token for removed apps unless they are registered again.")
        return "\n".join(lines)
