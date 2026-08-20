"""重试 Canvas Content 生成工具。"""

from typing import Any

from pydantic import Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
from app.tools.canvas.presentation import error_result, items_content
from app.tools.canvas.schemas import ProjectPathParams, RetryContentInput
from app.tools.canvas.tools.support import _application
from app.tools.core import tool
from app.tools.core.base_tool import BaseTool


@tool(name="retry_canvas_content_generation", code_mode_only=True)
class RetryCanvasContentGeneration(BaseTool[ProjectPathParams]):
    """<!--zh: 重试失败的 generated Content。-->Retry failed generated Content."""

    name = "retry_canvas_content_generation"
    feedback_action_key = "canvas.retry_generation"

    class Params(ProjectPathParams):
        """批量生成重试参数。"""

        items: list[RetryContentInput] = Field(..., min_length=1)

    params_class = Params

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: dict[str, Any] | None = None
    ) -> dict[str, str]:
        """生成失败 Content 重试前的受控反馈。"""
        args = arguments or {}
        items = args.get("items") or []
        project_path = args.get("project_path", "")
        remark = f"{project_path} · retrying {len(items)} failed Content item(s)" if project_path else f"retrying {len(items)} failed Content item(s)"
        return {
            "action": i18n.translate(self.feedback_action_key, category="tool.actions"),
            "remark": remark,
            "tool_name": tool_name,
        }

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: dict[str, Any] | None = None,
    ) -> dict[str, str]:
        """生成重试结果和失败上限反馈。"""
        if not result.ok:
            remark = i18n.translate("canvas.operation_failed", category="tool.messages")
        else:
            values = (result.data or {}).get("items", [])
            limited = sum(1 for item in values if item.get("error_code") == "CONTENT_RETRY_LIMIT_REACHED")
            remark = f"Retried {len(values) - limited} Content item(s)."
            if limited:
                remark += f" {limited} item(s) reached the retry limit."
        return {
            "action": i18n.translate(self.feedback_action_key, category="tool.actions"),
            "remark": remark,
        }

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: dict[str, Any] | None = None
    ) -> ToolDetail | None:
        """生成重试工具自己的任务详情。"""
        data = result.data or {}
        lines = [
            "Canvas Content retry",
            f"- Status: {'succeeded' if result.ok else 'failed'}",
            f"- Project path: {data.get('project_path') or (arguments or {}).get('project_path') or '-'}",
        ]
        for item in data.get("items", []):
            lines.append(
                f"- item_ref={item.get('item_ref', '-')} | status={item.get('status', '-')} | "
                f"element_id={item.get('element_id', '-')} | content_id={item.get('content_id', '-')} | "
                f"task_id={item.get('generation_task_id', '-') }"
            )
        return ToolDetail(
            type=DisplayType.MD,
            data=FileContent(file_name=f"{self.name}.md", content="\n".join(lines)),
        )

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """在重试上限内复用原 Content ID。"""
        try:
            result = await _application(tool_context).retry_content(
                params.project_path,
                [item.to_command() for item in params.items],
                tool_context=tool_context,
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
