"""新增 Canvas Element 工具。"""

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult

from app.tools.canvas.schemas import ElementInput, ProjectPathParams
from app.tools.canvas.tools.support import _application, error_result, items_content
from app.tools.canvas.tools.support import CanvasToolFeedbackMixin, BaseTool, Field, tool

@tool(name="add_canvas_elements", code_mode_only=True)
class AddCanvasElements(CanvasToolFeedbackMixin, BaseTool[ProjectPathParams]):
    """<!--zh: 新增 Canvas Element。-->Add Canvas Elements."""

    name = "add_canvas_elements"
    feedback_action_key = "canvas.add_elements"

    class Params(ProjectPathParams):
        """批量新增 Element 参数。"""

        items: list[ElementInput] = Field(..., min_length=1)

    params_class = Params

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """创建一批 Element，并按 item 返回真实标识。"""
        try:
            payload = [item.model_dump(exclude_none=True, by_alias=True) for item in params.items]
            result = await _application(tool_context).add_elements(params.project_path, payload, tool_context)
            return ToolResult(
                content=items_content(
                    "Canvas Elements added successfully.",
                    result,
                    "call query_canvas_element_details with the returned element_id values to verify the persisted Elements",
                ),
                data=result,
            )
        except Exception as error:
            return error_result(error)
