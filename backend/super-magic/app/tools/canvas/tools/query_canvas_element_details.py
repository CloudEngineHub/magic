"""查询 Canvas Element 详情工具。"""

from typing import Any

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n

from app.tools.canvas.schemas import ElementIdParams
from app.tools.canvas.presentation import elements_content, error_result
from app.tools.canvas.tools.support import _application
from app.tools.core import tool
from app.tools.core.base_tool import BaseTool

@tool(name="query_canvas_element_details", code_mode_only=True)
class QueryCanvasElementDetails(BaseTool[ElementIdParams]):
    """<!--zh: 查询精确 Canvas Element 详情。-->Query exact Canvas Element details."""

    name = "query_canvas_element_details"
    feedback_action_key = "canvas.query_elements"

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: dict[str, Any] | None = None
    ) -> dict[str, str]:
        """生成精确 Element 查询前的目标反馈。"""
        args = arguments or {}
        element_ids = args.get("element_ids") or []
        target = ", ".join(str(item) for item in element_ids) or "-"
        project_path = args.get("project_path", "")
        remark = f"{project_path} · Elements: {target}" if project_path else f"Elements: {target}"
        return {
            "action": i18n.translate(self.feedback_action_key, category="tool.actions"),
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
        """生成详情查询完成后的目标和结果反馈。"""
        if not result.ok:
            remark = i18n.translate("canvas.operation_failed", category="tool.messages")
        else:
            data = result.data or {}
            remark = f"Returned details for {len(data.get('elements', []))} Element(s)."
        return {
            "action": i18n.translate(self.feedback_action_key, category="tool.actions"),
            "remark": remark,
        }

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: dict[str, Any] | None = None
    ) -> ToolDetail | None:
        """生成详情查询自己的层级和 Content 摘要。"""
        data = result.data or {}
        lines = [
            "Canvas Element details",
            f"- Status: {'succeeded' if result.ok else 'failed'}",
            f"- Project path: {data.get('project_path') or (arguments or {}).get('project_path') or '-'}",
            f"- Elements: {len(data.get('elements', []))}",
        ]
        for element in data.get("elements", []):
            lines.append(
                f"- {element.get('element_id', '-')} | type={element.get('element_type', '-')} | "
                f"parent={element.get('parent_element_id') or '-'} | depth={element.get('depth', 0)} | "
                f"contents={len(element.get('contents') or [])} | children={len(element.get('children') or [])}"
            )
        for warning in data.get("warnings", []):
            lines.append(f"- Warning: {warning}")
        return ToolDetail(
            type=DisplayType.MD,
            data=FileContent(file_name=f"{self.name}.md", content="\n".join(lines)),
        )

    async def execute(self, tool_context: ToolContext, params: ElementIdParams) -> ToolResult:
        """读取指定 Element 和关联 Connection。"""
        try:
            result = await _application(tool_context).elements(params.project_path, params.element_ids)
            return ToolResult(content=elements_content(result), data=result)
        except Exception as error:
            return error_result(error)
