"""查询定时任务列表的 Code Mode 工具。"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.infrastructure.sdk.magic_service.parameter.message_schedule_parameter import (
    QueryMessageSchedulesParameter,
)
from app.tools.core import BaseToolParams, tool
from app.tools.scheduled_task._base import BaseScheduledTaskTool


class ScheduledTaskListParams(BaseToolParams):
    """查询定时任务列表的参数。"""

    page: int = Field(1, ge=1, description="""<!--zh: 页码，从 1 开始。-->Page number, starting from 1.""")
    page_size: int = Field(50, ge=1, description="""<!--zh: 每页数量。-->Page size.""")
    task_name: Optional[str] = Field(None, description="""<!--zh: 按任务名称模糊搜索。-->Fuzzy search by task name.""")
    enabled: Optional[Literal[0, 1]] = Field(None, description="""<!--zh: 1=启用中，0=已禁用。-->1=enabled, 0=disabled.""")
    completed: Optional[Literal[0, 1]] = Field(None, description="""<!--zh: 1=已完成，0=未完成。-->1=completed, 0=not completed.""")


@tool(name="scheduled_task_list")
class ScheduledTaskList(BaseScheduledTaskTool[ScheduledTaskListParams]):
    """<!--zh: 查询当前项目下的 magic-service 定时任务。-->
    List magic-service scheduled tasks in the current project."""

    name = "scheduled_task_list"

    async def execute(self, tool_context: ToolContext, params: ScheduledTaskListParams) -> ToolResult:
        """查询当前项目下的定时任务列表。"""
        try:
            parameter = QueryMessageSchedulesParameter(
                page=params.page,
                page_size=params.page_size,
                project_id=self.resolve_project_id(tool_context),
                task_name=params.task_name,
                enabled=params.enabled,
                completed=params.completed,
            )
            result = await self.magic_service_sdk().message_schedule.query_message_schedules_async(parameter)
            raw = result.get_raw_data()
            item_fields = ("id", "task_name", "task_describe", "agent_mode", "status", "enabled", "time_config", "deadline")
            data = {
                "total": raw.get("total", 0),
                "schedules": [
                    self.whitelist_fields(self.normalize_schedule_fields(item), item_fields)
                    for item in raw.get("list", [])
                    if isinstance(item, dict)
                ],
            }
            return self.success_result(data)
        except Exception as exc:
            return ToolResult.error(
                f"scheduled_task_list failed: {exc}",
                extra_info={"user_error": str(exc)},
            )
