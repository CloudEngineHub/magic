"""Canvas 布局工具。"""

from typing import Any

from pydantic import Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
from app.tools.canvas.presentation import error_result, items_content
from app.tools.canvas.schemas import LayoutElementInput, ProjectPathParams
from app.tools.canvas.tools.support import _application
from app.tools.core import tool
from app.tools.core.base_tool import BaseTool


@tool(name="layout_canvas_elements", code_mode_only=True)
class LayoutCanvasElements(BaseTool[ProjectPathParams]):
    """<!--zh: 使用布局策略调整 Element。-->Apply named layout strategies to Elements."""

    name = "layout_canvas_elements"
    feedback_action_key = "canvas.layout"

    class Params(ProjectPathParams):
        """批量布局参数。"""

        items: list[LayoutElementInput] = Field(..., min_length=1)

    params_class = Params

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: dict[str, Any] | None = None
    ) -> dict[str, str]:
        """生成布局执行前的策略和数量反馈。"""
        args = arguments or {}
        items = args.get("items") or []
        strategies = {
            str(item.get("layout", {}).get("strategy"))
            for item in items
            if isinstance(item, dict) and isinstance(item.get("layout"), dict)
        }
        strategy_text = ", ".join(sorted(strategies)) if strategies else "default strategy"
        project_path = args.get("project_path", "")
        remark = f"{project_path} · applying {strategy_text} to {len(items)} Element(s)" if project_path else f"applying {strategy_text} to {len(items)} Element(s)"
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
        """生成布局执行后的变更数量反馈。"""
        if not result.ok:
            remark = i18n.translate("canvas.operation_failed", category="tool.messages")
        else:
            values = (result.data or {}).get("items", [])
            remark = f"Updated layout for {len(values)} Element(s)."
        return {
            "action": i18n.translate(self.feedback_action_key, category="tool.actions"),
            "remark": remark,
        }

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: dict[str, Any] | None = None
    ) -> ToolDetail | None:
        """生成布局工具自己的坐标变更详情。"""
        data = result.data or {}
        lines = [
            "Canvas layout",
            f"- Status: {'succeeded' if result.ok else 'failed'}",
            f"- Project path: {data.get('project_path') or (arguments or {}).get('project_path') or '-'}",
        ]
        for item in data.get("items", []):
            layout = item.get("layout") or {}
            lines.append(
                f"- item_ref={item.get('item_ref', '-')} | status={item.get('status', '-')} | "
                f"element_id={item.get('element_id', '-')} | position=({layout.get('x', '-')}, {layout.get('y', '-')})"
            )
        return ToolDetail(
            type=DisplayType.MD,
            data=FileContent(file_name=f"{self.name}.md", content="\n".join(lines)),
        )

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """执行布局策略，不修改 Content 或 Connection。"""
        try:
            result = await _application(tool_context).layout(params.project_path, [item.to_command() for item in params.items])
            return ToolResult(
                content=items_content(
                    "Canvas layout updated successfully.",
                    result.to_dict(),
                    "call query_canvas_overview with the same project_path to verify the persisted layout",
                ),
                data=result.to_dict(),
            )
        except Exception as error:
            return error_result(error)
