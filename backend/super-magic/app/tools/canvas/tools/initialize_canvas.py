"""初始化 Canvas 工具。"""

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult

from app.tools.canvas.schemas import ProjectPathParams
from app.tools.canvas.tools.support import _application, error_result
from app.tools.canvas.tools.support import CanvasToolFeedbackMixin, BaseTool, tool

@tool(name="initialize_canvas", code_mode_only=True)
class InitializeCanvas(CanvasToolFeedbackMixin, BaseTool[ProjectPathParams]):
    """<!--zh: 初始化 Canvas 项目。-->Initialize a Canvas project."""

    name = "initialize_canvas"
    feedback_action_key = "canvas.initialize"

    async def execute(self, tool_context: ToolContext, params: ProjectPathParams) -> ToolResult:
        """初始化项目并返回工作区相对路径。"""
        try:
            result = await _application(tool_context).initialize(params.project_path)
            state = "created" if result["created"] else "already existed"
            return ToolResult(
                content=f"Canvas project {state}.\n- Project path: {params.project_path}",
                data=result,
            )
        except Exception as error:
            return error_result(error)
