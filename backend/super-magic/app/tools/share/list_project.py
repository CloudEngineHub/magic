"""查询项目分享的 Code Mode 工具。"""

from __future__ import annotations

import asyncio

from pydantic import Field

from agentlang.context.tool_context import ToolContext
from agentlang.logger import get_logger
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import ToolDetail
from app.tools.core import BaseTool, tool

from .list_base import BaseListShareParams
from .list_display import build_list_detail, build_list_error, build_list_result, list_after, list_before
from .models import ShareServiceError
from .query_service import ShareQueryService

logger = get_logger(__name__)


class ListProjectSharesParams(BaseListShareParams):
    """查询项目分享的扁平参数。"""

    current_project_only: bool = Field(
        True,
        description="Limit results to the current project by default. Set false to browse all project shares.",
    )


@tool(name="list_project_shares", code_mode_only=True)
class ListProjectShares(BaseTool[ListProjectSharesParams]):
    """Find or list shares for the current or other projects without changing them."""

    name = "list_project_shares"

    async def execute(self, tool_context: ToolContext, params: ListProjectSharesParams) -> ToolResult:
        try:
            result = await ShareQueryService().list_project_shares(
                tool_context,
                params.current_project_only,
                params.status,
                params.keyword,
                params.page,
                params.page_size,
            )
        except asyncio.CancelledError:
            raise
        except ShareServiceError as exc:
            return build_list_error("project", exc.info.message, exc.info.code)
        except Exception:
            logger.exception("查询项目分享时发生未处理异常")
            return build_list_error("project", "The project share query failed unexpectedly.")
        return build_list_result(result)

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: dict[str, object] | None = None
    ) -> dict[str, object]:
        return list_before(tool_name, "project")

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: dict[str, object] | None = None
    ) -> ToolDetail:
        return build_list_detail(result, "project")

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: dict[str, object] | None = None,
    ) -> dict[str, object]:
        return list_after(tool_name, "project", result, arguments)


__all__ = ["ListProjectShares", "ListProjectSharesParams"]
