"""局部更新活动话题分享的 Code Mode 工具。"""

from __future__ import annotations

import asyncio

from pydantic import Field

from agentlang.context.tool_context import ToolContext
from agentlang.logger import get_logger
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import ToolDetail
from app.tools.core import BaseTool, tool

from .management_display import (
    after_update,
    before_update,
    build_management_detail,
    build_management_error,
    build_management_result,
)
from .models import ShareErrorInfo, ShareServiceError
from .update_base import BaseUpdateShareParams, build_update_options
from .update_service import ShareUpdateService

logger = get_logger(__name__)


class UpdateTopicShareParams(BaseUpdateShareParams):
    """话题分享支持的扁平局部更新参数。"""

    show_file_list: bool | None = Field(
        None,
        description="Whether viewers may see the topic's shared file list. Omit to keep it.",
    )


@tool(name="update_topic_share", code_mode_only=True)
class UpdateTopicShare(BaseTool[UpdateTopicShareParams]):
    """Modify selected settings of one active topic share while preserving all omitted settings."""

    name = "update_topic_share"

    async def execute(self, tool_context: ToolContext, params: UpdateTopicShareParams) -> ToolResult:
        options = build_update_options(params, show_file_list=params.show_file_list)
        try:
            detail = await ShareUpdateService().update_topic_share(tool_context, params.share_ref, options)
        except asyncio.CancelledError:
            raise
        except ShareServiceError as exc:
            return build_management_error("update", "topic", exc.info)
        except Exception:
            logger.exception("更新话题分享时发生未处理异常")
            return build_management_error(
                "update",
                "topic",
                ShareErrorInfo(
                    code="unknown",
                    message="The topic share could not be updated because of an unexpected error.",
                ),
            )
        return build_management_result(detail, "updated")

    async def get_tool_detail(
        self,
        tool_context: ToolContext,
        result: ToolResult,
        arguments: dict[str, object] | None = None,
    ) -> ToolDetail:
        return build_management_detail(result, "update_topic_share.md")

    async def get_before_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        arguments: dict[str, object] | None = None,
    ) -> dict[str, object]:
        return before_update(tool_name, tool_context, arguments, "topic")

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: dict[str, object] | None = None,
    ) -> dict[str, object]:
        return after_update(tool_name, tool_context, result, execution_time, arguments, "topic")


__all__ = ["UpdateTopicShare", "UpdateTopicShareParams"]
