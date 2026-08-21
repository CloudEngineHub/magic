"""等待 Canvas 生成工具。"""

from typing import Any

from pydantic import ConfigDict, Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import ToolDetail
from app.i18n import i18n
from app.tools.canvas.presentation import CanvasToolDetailBuilder, canvas_remark, error_result, items_content
from app.tools.canvas.tools.support import _application
from app.tools.core import BaseToolParams, tool
from app.tools.core.base_tool import BaseTool


class WaitTask(BaseToolParams):
    """单个异步生成任务参数。"""

    model_config = ConfigDict(extra="forbid")

    generation_task_id: str = Field(..., min_length=1)


@tool(name="wait_canvas_generation", code_mode_only=True)
class WaitCanvasGeneration(BaseTool[BaseToolParams]):
    """<!--zh: 等待异步生成任务。-->Wait for Canvas generation tasks."""

    name = "wait_canvas_generation"
    feedback_action_key = "canvas.wait_generation"

    class Params(BaseToolParams):
        """批量等待参数。"""

        model_config = ConfigDict(extra="forbid")

        project_path: str = Field(..., min_length=1, description="Workspace-relative Canvas project path.")
        tasks: list[WaitTask] = Field(..., min_length=1)
        max_wait_seconds: int = Field(60, ge=1, le=600)

    params_class = Params

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: dict[str, Any] | None = None
    ) -> dict[str, str]:
        """生成等待生成任务前的任务数量和时间上限反馈。"""
        args = arguments or {}
        tasks = args.get("tasks") or []
        project_path = args.get("project_path", "")
        seconds = args.get("max_wait_seconds", 60)
        remark = canvas_remark(
            "canvas.wait_pending",
            project_path,
            total=len(tasks),
            seconds=seconds,
        )
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
        """根据任务状态生成等待完成、超时或部分完成反馈。"""
        args = arguments or {}
        if not result.ok:
            action_key = "canvas.wait_generation_failed"
            remark = i18n.translate("canvas.operation_failed", category="tool.messages")
        else:
            values = (result.data or {}).get("items", [])
            statuses = {item.get("status") for item in values}
            completed = sum(1 for item in values if item.get("status") == "completed")
            failed = sum(1 for item in values if item.get("status") in {"failed", "not_found", "not_applicable"})
            if any(item.get("timed_out") for item in values):
                action_key = "canvas.wait_generation_timeout"
                remark = canvas_remark("canvas.wait_timeout", completed=completed, total=len(values))
            elif statuses and statuses <= {"completed"}:
                action_key = "canvas.wait_generation_completed"
                remark = canvas_remark("canvas.wait_completed", completed=completed, total=len(values))
            elif statuses and statuses <= {"failed", "not_found", "not_applicable"}:
                action_key = "canvas.wait_generation_failed"
                remark = canvas_remark("canvas.wait_failed", failed=failed, total=len(values))
            else:
                action_key = "canvas.wait_generation_partial"
                remark = canvas_remark(
                    "canvas.wait_partial",
                    completed=completed,
                    failed=failed,
                    total=len(values),
                )
        return {
            "action": i18n.translate(action_key, category="tool.actions"),
            "remark": remark,
        }

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: dict[str, Any] | None = None
    ) -> ToolDetail | None:
        """生成等待工具自己的任务状态详情。"""
        data = result.data or {}
        builder = CanvasToolDetailBuilder(self.name, "generation_wait", result, arguments)
        builder.add_field("project_path", data.get("project_path") or builder.arguments.get("project_path") or "-")
        for item in data.get("items", []):
            builder.add_item(
                {
                    "task_id": item.get("generation_task_id", "-"),
                    "status": item.get("status", "-"),
                    "timed_out": item.get("timed_out"),
                    "element_id": item.get("element_id", "-"),
                }
            )
        return builder.build()

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
            return ToolResult(content=items_content("Canvas generation status returned.", result.to_dict()), data=result.to_dict())
        except Exception as error:
            return error_result(error)
