"""重试 Canvas Content 生成工具。"""

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult

from app.tools.canvas.schemas import ProjectPathParams, RetryContentInput
from app.tools.canvas.tools.support import _application, error_result, items_content
from app.tools.canvas.tools.support import CanvasToolFeedbackMixin, BaseTool, Field, tool

@tool(name="retry_canvas_content_generation", code_mode_only=True)
class RetryCanvasContentGeneration(CanvasToolFeedbackMixin, BaseTool[ProjectPathParams]):
    """<!--zh: 重试失败的 generated Content。-->Retry failed generated Content."""

    name = "retry_canvas_content_generation"
    feedback_action_key = "canvas.retry_generation"

    class Params(ProjectPathParams):
        """批量生成重试参数。"""

        items: list[RetryContentInput] = Field(..., min_length=1)

    params_class = Params

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """在重试上限内复用原 Content ID。"""
        try:
            payload = [item.model_dump(exclude_none=True) for item in params.items]
            result = await _application(tool_context).retry_content(
                params.project_path,
                payload,
                tool_context,
            )
            return ToolResult(
                content=items_content(
                    "Canvas failed Content retry started.",
                    result,
                    "call query_canvas_element_details with the returned element_id values to verify the retried Content",
                ),
                data=result,
            )
        except Exception as error:
            return error_result(error)
