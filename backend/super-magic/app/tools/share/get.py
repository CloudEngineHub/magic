"""读取单条活动分享完整配置的 Code Mode 工具。"""

from __future__ import annotations

import asyncio

from pydantic import ConfigDict, Field

from agentlang.context.tool_context import ToolContext
from agentlang.logger import get_logger
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import ToolDetail
from app.tools.core import BaseTool, BaseToolParams, tool

from .detail_service import ShareDetailService
from .management_display import (
    after_get,
    before_get,
    build_management_detail,
    build_management_error,
    build_management_result,
)
from .models import ShareErrorInfo, ShareServiceError

logger = get_logger(__name__)


class GetShareParams(BaseToolParams):
    """读取活动分享所需的扁平引用。"""

    model_config = ConfigDict(extra="forbid")

    share_ref: str = Field(
        ...,
        min_length=1,
        description=(
            "Active share resource ID. For a topic share, pass its topic ID directly. "
            "A complete /share/files/{id} or /share/topic/{id} URL is also accepted."
        ),
    )


@tool(name="get_share", code_mode_only=True)
class GetShare(BaseTool[GetShareParams]):
    """Read one active share's complete settings without changing it."""

    name = "get_share"

    async def execute(self, tool_context: ToolContext, params: GetShareParams) -> ToolResult:
        try:
            detail = await ShareDetailService().get_share(tool_context, params.share_ref)
        except asyncio.CancelledError:
            raise
        except ShareServiceError as exc:
            return build_management_error("read", "share", exc.info)
        except Exception:
            logger.exception("读取分享详情时发生未处理异常")
            return build_management_error(
                "read",
                "share",
                ShareErrorInfo(
                    code="unknown",
                    message="The share details could not be loaded because of an unexpected error.",
                ),
            )
        return build_management_result(detail, "read")

    async def get_tool_detail(
        self,
        tool_context: ToolContext,
        result: ToolResult,
        arguments: dict[str, object] | None = None,
    ) -> ToolDetail:
        return build_management_detail(result, "get_share.md")

    async def get_before_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        arguments: dict[str, object] | None = None,
    ) -> dict[str, object]:
        return before_get(tool_name, tool_context, arguments)

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: dict[str, object] | None = None,
    ) -> dict[str, object]:
        return after_get(tool_name, tool_context, result, execution_time, arguments)


__all__ = ["GetShare", "GetShareParams"]
