"""等待 Canvas 生成工具。"""

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult

from app.tools.canvas.schemas import ProjectPathParams, WaitTask
from app.tools.canvas.tools.support import _application, error_result, items_content
from app.tools.canvas.tools.support import CanvasToolFeedbackMixin, BaseTool, Field, tool

@tool(name="wait_canvas_generation", code_mode_only=True)
class WaitCanvasGeneration(CanvasToolFeedbackMixin, BaseTool[ProjectPathParams]):
    """<!--zh: 等待异步生成任务。-->Wait for Canvas generation tasks."""

    name = "wait_canvas_generation"
    feedback_action_key = "canvas.wait_generation"

    class Params(ProjectPathParams):
        """批量等待参数。"""

        tasks: list[WaitTask] = Field(..., min_length=1)
        max_wait_seconds: int = Field(60, ge=1, le=600)

    params_class = Params

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """查询任务状态；超时后继续使用原任务 ID。"""
        try:
            task_ids = [task.generation_task_id for task in params.tasks]
            result = await _application(tool_context).wait(
                params.project_path,
                task_ids,
                params.max_wait_seconds,
                tool_context,
            )
            return ToolResult(content=items_content("Canvas generation status returned.", result), data=result)
        except Exception as error:
            return error_result(error)
