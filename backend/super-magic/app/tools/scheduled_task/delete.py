"""删除定时任务的 Code Mode 工具。"""

from __future__ import annotations

from pydantic import Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.infrastructure.sdk.magic_service.parameter.message_schedule_parameter import (
    DeleteMessageScheduleParameter,
)
from app.tools.core import BaseToolParams, tool
from app.tools.scheduled_task._base import BaseScheduledTaskTool


class ScheduledTaskDeleteParams(BaseToolParams):
    """删除定时任务的参数。"""

    id: str = Field(..., description="""<!--zh: 定时任务 ID。-->Scheduled task ID.""")


@tool(name="scheduled_task_delete")
class ScheduledTaskDelete(BaseScheduledTaskTool[ScheduledTaskDeleteParams]):
    """<!--zh: 删除 magic-service 定时任务。-->
    Delete one magic-service scheduled task."""

    name = "scheduled_task_delete"

    async def execute(self, tool_context: ToolContext, params: ScheduledTaskDeleteParams) -> ToolResult:
        """删除定时任务。"""
        try:
            parameter = DeleteMessageScheduleParameter(schedule_id=params.id)
            await self.magic_service_sdk().message_schedule.delete_message_schedule_async(parameter)
            return self.success_result({"id": params.id})
        except Exception as exc:
            return ToolResult.error(
                f"scheduled_task_delete failed: {exc}",
                extra_info={"user_error": str(exc)},
            )
