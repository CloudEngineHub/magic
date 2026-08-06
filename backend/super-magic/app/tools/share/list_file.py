"""查询文件分享的 Code Mode 工具。"""

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


class ListFileSharesParams(BaseListShareParams):
    """查询文件分享的扁平参数。"""

    file_paths: list[str] = Field(
        default_factory=list,
        description="Optional workspace-relative paths. When provided, find the exact active share for this file set.",
    )
    current_project_only: bool = Field(
        True,
        description=(
            "When browsing without file_paths, limit results to the current project by default. "
            "Set false only when the user explicitly asks to browse file shares across projects."
        ),
    )


@tool(name="list_file_shares", code_mode_only=True)
class ListFileShares(BaseTool[ListFileSharesParams]):
    """Find or list shares for workspace files without changing them."""

    name = "list_file_shares"

    async def execute(self, tool_context: ToolContext, params: ListFileSharesParams) -> ToolResult:
        try:
            result = await ShareQueryService().list_file_shares(
                tool_context,
                params.file_paths,
                params.status,
                params.keyword,
                params.current_project_only,
                params.page,
                params.page_size,
            )
        except asyncio.CancelledError:
            raise
        except ShareServiceError as exc:
            return build_list_error("files", exc.info.message, exc.info.code)
        except Exception:
            logger.exception("查询文件分享时发生未处理异常")
            return build_list_error("files", "The file share query failed unexpectedly.")
        return build_list_result(result)

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: dict[str, object] | None = None
    ) -> dict[str, object]:
        return list_before(tool_name, "files")

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: dict[str, object] | None = None
    ) -> ToolDetail:
        return build_list_detail(result, "files")

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: dict[str, object] | None = None,
    ) -> dict[str, object]:
        return list_after(tool_name, "files", result, arguments)


__all__ = ["ListFileShares", "ListFileSharesParams"]
