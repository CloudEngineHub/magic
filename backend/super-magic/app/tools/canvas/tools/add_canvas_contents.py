"""追加 Canvas Content 工具。"""

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult

from app.tools.canvas.schemas import AddContentInput, ProjectPathParams
from app.tools.canvas.tools.support import _application, error_result, items_content
from app.tools.canvas.tools.support import CanvasToolFeedbackMixin, BaseTool, Field, tool

@tool(name="add_canvas_contents", code_mode_only=True)
class AddCanvasContents(CanvasToolFeedbackMixin, BaseTool[ProjectPathParams]):
    """<!--zh: 向已有 Element 追加 Content。-->Add Content versions to existing Elements."""

    name = "add_canvas_contents"
    feedback_action_key = "add_canvas_contents"

    class Params(ProjectPathParams):
        """批量追加 Content 参数。"""

        items: list[AddContentInput] = Field(..., min_length=1)

    params_class = Params

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """追加 Content 版本，不覆盖已有版本。"""
        try:
            payload = [item.model_dump(exclude_none=True, by_alias=True) for item in params.items]
            result = await _application(tool_context).add_contents(params.project_path, payload, tool_context)
            return ToolResult(
                content=items_content(
                    "Canvas Content versions added successfully.",
                    result,
                    "call query_canvas_element_details with the returned element_id values to verify the Content versions",
                ),
                data=result,
            )
        except Exception as error:
            return error_result(error)
