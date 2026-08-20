"""Frame 框选工具。"""

from typing import Any

from pydantic import Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
from app.tools.canvas.presentation import error_result, items_content
from app.tools.canvas.schemas import FrameSelectionInput, ProjectPathParams
from app.tools.canvas.tools.support import _application
from app.tools.core import tool
from app.tools.core.base_tool import BaseTool


@tool(name="frame_canvas_elements", code_mode_only=True)
class FrameCanvasElements(BaseTool[ProjectPathParams]):
    """<!--zh: 将已有同层级节点框选为新的 Frame。-->Frame existing sibling Elements."""

    name = "frame_canvas_elements"
    feedback_action_key = "canvas.frame_elements"

    class Params(ProjectPathParams):
        """批量框选参数。"""

        items: list[FrameSelectionInput] = Field(..., min_length=1)

    params_class = Params

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: dict[str, Any] | None = None
    ) -> dict[str, str]:
        """生成框选前的选区反馈。"""
        args = arguments or {}
        items = args.get("items") or []
        selected = sum(len(item.get("element_ids") or []) for item in items if isinstance(item, dict))
        project_path = args.get("project_path", "")
        remark = f"{project_path} · framing {selected} Element(s)" if project_path else f"framing {selected} Element(s)"
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
        """生成框选后的 Frame 数量反馈。"""
        if not result.ok:
            remark = i18n.translate("canvas.operation_failed", category="tool.messages")
        else:
            values = (result.data or {}).get("items", [])
            remark = f"Created {sum(1 for item in values if item.get('status') in {'created', 'completed', 'added'})} Frame(s)."
        return {
            "action": i18n.translate(self.feedback_action_key, category="tool.actions"),
            "remark": remark,
        }

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: dict[str, Any] | None = None
    ) -> ToolDetail | None:
        """生成框选工具自己的层级详情。"""
        data = result.data or {}
        lines = [
            "Canvas Frames created",
            f"- Status: {'succeeded' if result.ok else 'failed'}",
            f"- Project path: {data.get('project_path') or (arguments or {}).get('project_path') or '-'}",
        ]
        for item in data.get("items", []):
            lines.append(
                f"- item_ref={item.get('item_ref', '-')} | status={item.get('status', '-')} | "
                f"frame_element_id={item.get('frame_element_id', '-')} | "
                f"child_count={len(item.get('child_element_ids') or [])}"
            )
        return ToolDetail(
            type=DisplayType.MD,
            data=FileContent(file_name=f"{self.name}.md", content="\n".join(lines)),
        )

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """创建 Frame 并返回真实 Frame 和子节点 ID。"""
        try:
            result = await _application(tool_context).frame_elements(
                params.project_path,
                [item.to_command() for item in params.items],
            )
            return ToolResult(
                content=items_content(
                    "Canvas Frames created successfully.",
                    result,
                    "call query_canvas_element_details with the returned frame_element_id values to verify the hierarchy",
                ),
                data=result,
            )
        except Exception as error:
            return error_result(error)
