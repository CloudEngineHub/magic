"""Canvas 布局工具。"""

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult

from app.tools.canvas.schemas import LayoutElementInput, ProjectPathParams
from app.tools.canvas.tools.support import _application, error_result, items_content
from app.tools.canvas.tools.support import CanvasToolFeedbackMixin, BaseTool, Field, tool

@tool(name="layout_canvas_elements", code_mode_only=True)
class LayoutCanvasElements(CanvasToolFeedbackMixin, BaseTool[ProjectPathParams]):
    """<!--zh: 使用布局策略调整 Element。-->Apply named layout strategies to Elements."""

    name = "layout_canvas_elements"
    feedback_action_key = "canvas.layout"

    class Params(ProjectPathParams):
        """批量布局参数。"""

        items: list[LayoutElementInput] = Field(..., min_length=1)

    params_class = Params

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """执行布局策略，不修改 Content 或 Connection。"""
        try:
            payload = [item.model_dump(exclude_none=True) for item in params.items]
            result = await _application(tool_context).layout(params.project_path, payload)
            return ToolResult(
                content=items_content(
                    "Canvas layout updated successfully.",
                    result,
                    "call query_canvas_overview with the same project_path to verify the persisted layout",
                ),
                data=result,
            )
        except Exception as error:
            return error_result(error)
