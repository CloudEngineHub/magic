"""移除 OAuth2 接口文档的 Code Mode 工具。"""

from __future__ import annotations

from pydantic import Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import ToolDetail
from app.i18n import i18n
from app.tools.core import BaseToolParams, tool
from app.tools.oauth2._api_docs import BaseOAuth2ApiDocTool


class OAuth2RemoveApiDocParams(BaseToolParams):
    """Parameters for removing OAuth2 API documentation."""

    app_name: str = Field(
        ...,
        description="Registered OAuth2 app name. Each call can target only one app.",
    )
    operation_ids: list[str] = Field(
        ...,
        description="OpenAPI operationIds to delete. Use a one-item list for one document.",
    )

    def target_operation_ids(self) -> list[str]:
        """返回归一化后的待删除 operationId 列表。"""
        return list(dict.fromkeys(item.strip() for item in self.operation_ids if item.strip()))


@tool(name="oauth2_remove_api_doc")
class OAuth2RemoveApiDoc(BaseOAuth2ApiDocTool[OAuth2RemoveApiDocParams]):
    """Delete recorded API documents under one OAuth2 app by operationId."""

    name = "oauth2_remove_api_doc"

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: dict | None = None
    ) -> dict:
        """返回删除接口文档前的展示文案。"""
        args = arguments or {}
        operation_id = self._argument_label(args)
        return {
            "action": i18n.translate("oauth2_remove_api_doc", category="tool.actions"),
            "remark": i18n.translate(
                "oauth2.api_docs.removing",
                category="tool.messages",
                operation_id=operation_id,
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
        """返回删除接口文档后的展示文案。"""
        args = arguments or {}
        message_key = "oauth2.api_docs.removed" if result.ok else "oauth2.api_docs.remove_failed"
        return {
            "action": i18n.translate("oauth2_remove_api_doc", category="tool.actions"),
            "remark": i18n.translate(
                message_key,
                category="tool.messages",
                operation_id=self._argument_label(result.extra_info or args),
            ),
            "tool_name": tool_name,
        }

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: dict | None = None
    ) -> ToolDetail | None:
        """返回删除接口文档的用户可见详情。"""
        args = arguments or {}
        info = result.extra_info or {}
        removed = info.get("removed") or []
        not_found = info.get("not_found") or []
        failed = info.get("failed") or []
        lines = [
            "# OAuth2 接口文档移除结果",
            "",
            f"- 状态: {'已移除' if result.ok else '存在失败项'}",
            f"- app_name: `{info.get('app_name') or args.get('app_name') or '-'}`",
            f"- operation_id: `{self._argument_label(info or args)}`",
            f"- 移除成功: {len(removed)}",
            f"- 未找到: {len(not_found)}",
            f"- 移除失败: {len(failed)}",
        ]
        if removed:
            lines.extend(["", "## 移除成功", "", *[self._format_target_line(item) for item in removed]])
        if not_found:
            lines.extend(["", "## 未找到", "", *[self._format_target_line(item) for item in not_found]])
        if failed:
            lines.extend([
                "",
                "## 移除失败",
                "",
                *[f"- `{item.get('app_name')}` / `{item.get('operation_id')}`: {item.get('error')}" for item in failed],
            ])
        if not result.ok:
            lines.append(f"- 错误: {self.user_error(result)}")
        return self.markdown_file("oauth2_api_doc_remove.md", lines)

    async def execute(self, tool_context: ToolContext, params: OAuth2RemoveApiDocParams) -> ToolResult:
        """根据 operationId 删除同一个 app 下的一个或多个接口文档。"""
        timezone_name = self.resolve_timezone(tool_context)
        operation_ids = params.target_operation_ids()
        if not operation_ids:
            user_error = "必须提供 operation_ids。"
            return ToolResult.error(
                "operation_ids is required.",
                extra_info={"app_name": params.app_name, "user_error": user_error},
            )

        app_name = params.app_name
        registry = self.app_registry()
        store = self.api_doc_store()
        removed: list[dict[str, str]] = []
        not_found: list[dict[str, str]] = []
        failed: list[dict[str, str]] = []

        try:
            await registry.get(app_name)
        except Exception as exc:
            data = {
                "app_name": app_name,
                "operation_id": operation_ids[0] if len(operation_ids) == 1 else "",
                "operation_ids": operation_ids,
                "targets": [{"app_name": app_name, "operation_id": operation_id} for operation_id in operation_ids],
                "removed": removed,
                "not_found": not_found,
                "failed": [{"app_name": app_name, "operation_id": operation_id, "error": str(exc)} for operation_id in operation_ids],
                "user_error": str(exc),
            }
            return ToolResult.error(f"OAuth2 API documentation delete failed: {exc}", data=data, extra_info=data)

        for operation_id in operation_ids:
            target = {"app_name": app_name, "operation_id": operation_id}
            try:
                is_deleted = await store.delete_operation(app_name, operation_id, timezone_name)
            except Exception as exc:
                failed.append({"app_name": app_name, "operation_id": operation_id, "error": str(exc)})
                continue
            if is_deleted:
                removed.append(target)
            else:
                not_found.append(target)

        ok = not not_found and not failed
        user_error = self._build_user_error(not_found, failed)
        data = {
            "app_name": app_name,
            "operation_id": operation_ids[0] if len(operation_ids) == 1 else "",
            "operation_ids": operation_ids,
            "targets": [{"app_name": app_name, "operation_id": operation_id} for operation_id in operation_ids],
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
        """从工具入参或结果中生成 operation_id 展示标签。"""
        ids = list(dict.fromkeys(str(item).strip() for item in (values.get("operation_ids") or []) if str(item).strip()))
        for key in ("targets", "removed", "not_found"):
            for item in values.get(key) or []:
                operation_id = item.get("operation_id") if isinstance(item, dict) else ""
                if operation_id and operation_id not in ids:
                    ids.append(operation_id)
        return "、".join(ids) if ids else "-"

    @staticmethod
    def _format_target_line(item: dict[str, str]) -> str:
        """格式化单个删除目标的 Markdown 行。"""
        return f"- `{item.get('app_name')}` / `{item.get('operation_id')}`"

    @staticmethod
    def _build_user_error(not_found: list[dict], failed: list[dict]) -> str:
        """构造批量移除失败时的用户可见错误摘要。"""
        parts: list[str] = []
        if not_found:
            parts.append(
                "未找到: " + ", ".join(f"{item['app_name']}/{item['operation_id']}" for item in not_found)
            )
        if failed:
            parts.append("移除失败: " + ", ".join(f"{item['app_name']}/{item['operation_id']}({item['error']})" for item in failed))
        return "；".join(parts)

    @staticmethod
    def _build_content(removed: list[dict], not_found: list[dict], failed: list[dict]) -> str:
        """构造批量移除结果给模型看的内容。"""
        return "\n".join([
            "OAuth2 API documentation removal completed.",
            f"Removed: {removed or []}",
            f"Not found: {not_found or []}",
            f"Failed: {failed or []}",
        ])
