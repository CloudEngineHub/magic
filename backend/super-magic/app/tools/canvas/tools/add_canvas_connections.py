"""Canvas Connection 工具。"""

from typing import Any

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n

from app.tools.canvas.schemas import ConnectionInput, ProjectPathParams
from app.tools.canvas.presentation import error_result, items_content
from app.tools.canvas.tools.support import _application
from app.tools.core import tool
from app.tools.core.base_tool import BaseTool
from pydantic import Field

@tool(name="add_canvas_connections", code_mode_only=True)
class AddCanvasConnections(BaseTool[ProjectPathParams]):
    """<!--zh: 新增、删除或替换明确的 Connection。-->Manage explicit Canvas Connections."""

    name = "add_canvas_connections"
    feedback_action_key = "add_canvas_connections"

    class Params(ProjectPathParams):
        """批量 Connection 操作参数。"""

        items: list[ConnectionInput] = Field(..., min_length=1)

    params_class = Params

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: dict[str, Any] | None = None
    ) -> dict[str, str]:
        """根据新增、删除、替换参数生成连线操作前反馈。"""
        args = arguments or {}
        items = args.get("items") or []
        if any(item.get("replace_existing_connections") for item in items if isinstance(item, dict)):
            action_key = "canvas.replace_connections"
            operation = "replacing Connections"
        elif items and all(
            item.get("remove_connection_ids") and not item.get("source_element_id")
            for item in items if isinstance(item, dict)
        ):
            action_key = "canvas.remove_connections"
            operation = "removing Connections"
        else:
            action_key = self.feedback_action_key
            operation = "updating Connections"
        project_path = args.get("project_path", "")
        remark = f"{project_path} · {operation} ({len(items)} item(s))" if project_path else f"{operation} ({len(items)} item(s))"
        return {
            "action": i18n.translate(action_key, category="tool.actions"),
            "remark": remark,
            "tool_name": tool_name,
        }

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: dict[str, Any] | None = None,
    ) -> dict[str, str]:
        """生成连线操作后的新增、删除或替换结果反馈。"""
        if not result.ok:
            remark = i18n.translate("canvas.operation_failed", category="tool.messages")
        else:
            values = (result.data or {}).get("items", [])
            removed = sum(1 for item in values if item.get("status") in {"removed", "already_removed"})
            replaced = sum(1 for item in values if item.get("status") in {"replaced", "already_replaced"})
            added = len(values) - removed - replaced
            remark = f"Connections updated: {added} added, {removed} removed, {replaced} replaced."
        args = arguments or {}
        items = args.get("items") or []
        if any(item.get("replace_existing_connections") for item in items if isinstance(item, dict)):
            action_key = "canvas.replace_connections"
        elif items and all(
            item.get("remove_connection_ids") and not item.get("source_element_id")
            for item in items if isinstance(item, dict)
        ):
            action_key = "canvas.remove_connections"
        else:
            action_key = self.feedback_action_key
        return {
            "action": i18n.translate(action_key, category="tool.actions"),
            "remark": remark,
        }

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: dict[str, Any] | None = None
    ) -> ToolDetail | None:
        """生成连线工具自己的端点和操作详情。"""
        data = result.data or {}
        lines = [
            "Canvas Connections",
            f"- Status: {'succeeded' if result.ok else 'failed'}",
            f"- Project path: {data.get('project_path') or (arguments or {}).get('project_path') or '-'}",
        ]
        for item in data.get("items", []):
            lines.append(
                f"- item_ref={item.get('item_ref', '-')} | status={item.get('status', '-')} | "
                f"connection_id={item.get('connection_id', '-')} | "
                f"source={item.get('source_element_id', '-')} | target={item.get('target_element_id', '-')}"
            )
        return ToolDetail(
            type=DisplayType.MD,
            data=FileContent(file_name=f"{self.name}.md", content="\n".join(lines)),
        )

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """按明确 ID 管理 Connection。"""
        try:
            result = await _application(tool_context).connections(params.project_path, [item.to_command() for item in params.items])
            return ToolResult(
                content=items_content(
                    "Canvas Connections updated successfully.",
                    result,
                    "call query_canvas_element_details with the affected Element IDs to verify the Connections",
                ),
                data=result,
            )
        except Exception as error:
            return error_result(error)
