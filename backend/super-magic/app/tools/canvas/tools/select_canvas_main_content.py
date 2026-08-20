"""选择 Canvas 主 Content 工具。"""

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult

from app.tools.canvas.schemas import MainContentInput, ProjectPathParams
from app.tools.canvas.tools.support import _application, error_result, items_content
from app.tools.canvas.tools.support import CanvasToolFeedbackMixin, BaseTool, Field, tool

@tool(name="select_canvas_main_content", code_mode_only=True)
class SelectCanvasMainContent(CanvasToolFeedbackMixin, BaseTool[ProjectPathParams]):
    """<!--zh: 显式选择 Element 的主 Content。-->Select the main Content for Elements."""

    name = "select_canvas_main_content"
    feedback_action_key = "canvas.select_main"

    class Params(ProjectPathParams):
        """批量选择主 Content 参数。"""

        items: list[MainContentInput] = Field(..., min_length=1)

    params_class = Params

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """只修改明确选择的 main Content 指针。"""
        try:
            result = await _application(tool_context).select_main(
                params.project_path,
                [item.model_dump() for item in params.items],
            )
            return ToolResult(
                content=items_content(
                    "Canvas main Content selected successfully.",
                    result,
                    "call query_canvas_element_details with the returned element_id values to verify the main Content selection",
                ),
                data=result,
            )
        except Exception as error:
            return error_result(error)
