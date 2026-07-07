"""获取定时任务详情的 Code Mode 工具。"""

from __future__ import annotations

from pydantic import Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.infrastructure.sdk.magic_service.parameter.message_schedule_parameter import (
    GetMessageScheduleDetailParameter,
)
from app.tools.core import BaseToolParams, tool
from app.tools.scheduled_task._base import BaseScheduledTaskTool


class ScheduledTaskGetParams(BaseToolParams):
    """获取定时任务详情的参数。"""

    id: str = Field(..., description="""<!--zh: 定时任务 ID。-->Scheduled task ID.""")


@tool(name="scheduled_task_get")
class ScheduledTaskGet(BaseScheduledTaskTool[ScheduledTaskGetParams]):
    """<!--zh: 获取 magic-service 定时任务详情。-->
    Get one magic-service scheduled task."""

    name = "scheduled_task_get"

    async def execute(self, tool_context: ToolContext, params: ScheduledTaskGetParams) -> ToolResult:
        """获取定时任务详情。"""
        try:
            parameter = GetMessageScheduleDetailParameter(schedule_id=params.id)
            result = await self.magic_service_sdk().message_schedule.get_message_schedule_detail_async(parameter)
            fields = (
                "id",
                "task_name",
                "task_describe",
                "message_content",
                "time_config",
                "status",
                "enabled",
                "deadline",
            )
            return self.success_result(self.whitelist_fields(result.get_raw_data(), fields))
        except Exception as exc:
            return ToolResult.error(
                f"scheduled_task_get failed: {exc}",
                extra_info={"user_error": str(exc)},
            )
