"""Frame 框选工具。"""

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult

from app.tools.canvas.schemas import FrameSelectionInput, ProjectPathParams
from app.tools.canvas.tools.support import _application, error_result, items_content
from app.tools.canvas.tools.support import CanvasToolFeedbackMixin, BaseTool, Field, tool

@tool(name="frame_canvas_elements", code_mode_only=True)
class FrameCanvasElements(CanvasToolFeedbackMixin, BaseTool[ProjectPathParams]):
    """<!--zh: 将已有同层级节点框选为新的 Frame。-->Frame existing sibling Elements."""

    name = "frame_canvas_elements"
    feedback_action_key = "canvas.frame_elements"

    class Params(ProjectPathParams):
        """批量框选参数。"""

        items: list[FrameSelectionInput] = Field(..., min_length=1)

    params_class = Params

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """创建 Frame 并返回真实 Frame 和子节点 ID。"""
        try:
            payload = [item.model_dump(exclude_none=True) for item in params.items]
            result = await _application(tool_context).frame_elements(params.project_path, payload)
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
