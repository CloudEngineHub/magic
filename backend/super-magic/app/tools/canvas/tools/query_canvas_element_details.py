"""查询 Canvas Element 详情工具。"""

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult

from app.tools.canvas.schemas import ElementIdParams
from app.tools.canvas.tools.support import _application, error_result, elements_content
from app.tools.canvas.tools.support import CanvasToolFeedbackMixin, BaseTool, tool

@tool(name="query_canvas_element_details", code_mode_only=True)
class QueryCanvasElementDetails(CanvasToolFeedbackMixin, BaseTool[ElementIdParams]):
    """<!--zh: 查询精确 Canvas Element 详情。-->Query exact Canvas Element details."""

    name = "query_canvas_element_details"
    feedback_action_key = "canvas.query_elements"

    async def execute(self, tool_context: ToolContext, params: ElementIdParams) -> ToolResult:
        """读取指定 Element 和关联 Connection。"""
        try:
            result = await _application(tool_context).elements(params.project_path, params.element_ids)
            return ToolResult(content=elements_content(result), data=result)
        except Exception as error:
            return error_result(error)
