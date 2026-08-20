"""Canvas Connection 工具。"""

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult

from app.tools.canvas.schemas import ConnectionInput, ProjectPathParams
from app.tools.canvas.tools.support import _application, error_result, items_content
from app.tools.canvas.tools.support import CanvasToolFeedbackMixin, BaseTool, Field, tool

@tool(name="add_canvas_connections", code_mode_only=True)
class AddCanvasConnections(CanvasToolFeedbackMixin, BaseTool[ProjectPathParams]):
    """<!--zh: 新增、删除或替换明确的 Connection。-->Manage explicit Canvas Connections."""

    name = "add_canvas_connections"
    feedback_action_key = "add_canvas_connections"

    class Params(ProjectPathParams):
        """批量 Connection 操作参数。"""

        items: list[ConnectionInput] = Field(..., min_length=1)

    params_class = Params

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """按明确 ID 管理 Connection。"""
        try:
            payload = [item.model_dump(exclude_none=True) for item in params.items]
            result = await _application(tool_context).connections(params.project_path, payload)
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
