"""查询 Canvas 概览工具。"""

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult

from app.tools.canvas.schemas import ProjectPathParams
from app.tools.canvas.tools.support import _application, error_result, overview_content
from app.tools.canvas.tools.support import CanvasToolFeedbackMixin, BaseTool, Field, tool

@tool(name="query_canvas_overview", code_mode_only=True)
class QueryCanvasOverview(CanvasToolFeedbackMixin, BaseTool[ProjectPathParams]):
    """<!--zh: 查询 Canvas 轻量概览。-->Query a lightweight Canvas overview."""

    name = "query_canvas_overview"
    feedback_action_key = "canvas.query_overview"

    class Params(ProjectPathParams):
        """概览分页参数。"""

        page: int = Field(1, ge=1, description="One-based page number.")
        limit: int = Field(50, ge=1, le=100, description="Maximum Elements returned on this page.")

    params_class = Params

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """读取当前分页概览。"""
        try:
            result = await _application(tool_context).overview(params.project_path, params.page, params.limit)
            return ToolResult(content=overview_content(result), data=result)
        except Exception as error:
            return error_result(error)
