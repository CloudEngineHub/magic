"""创建当前话题分享的 Code Mode 工具。"""

from __future__ import annotations

import asyncio

from pydantic import Field

from agentlang.context.tool_context import ToolContext
from agentlang.logger import get_logger
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import ToolDetail
from app.tools.core import BaseTool, tool

from .create_base import BaseCreateShareParams, build_share_options
from .display import after_create, before_create, build_creation_detail, build_creation_result, build_error_result
from .models import ShareErrorInfo, ShareServiceError
from .service import ShareService

logger = get_logger(__name__)


class CreateTopicShareParams(BaseCreateShareParams):
    """创建话题分享的扁平参数。"""

    show_file_list: bool = Field(
        True,
        description="Show the topic's shared file list to viewers.",
    )

    @classmethod
    def model_json_schema_clean(cls, **kwargs: object) -> dict[str, object]:
        """明确声明无必填参数，避免通用 Schema 回退把所有默认字段误标为必填。"""
        schema = super().model_json_schema_clean(**kwargs)
        schema["required"] = []
        return schema


@tool(name="create_topic_share", code_mode_only=True)
class CreateTopicShare(BaseTool[CreateTopicShareParams]):
    """Create or update a share for the current topic without file path parameters."""

    name = "create_topic_share"

    async def execute(self, tool_context: ToolContext, params: CreateTopicShareParams) -> ToolResult:
        options = build_share_options(
            params,
            allow_copy=True,
            show_file_list=params.show_file_list,
            hide_super_magic_watermark=False,
            immersive=False,
            resource_id=None,
            update_existing=params.update_existing,
        )
        try:
            result = await ShareService().create_topic_share(tool_context, options)
        except asyncio.CancelledError:
            raise
        except ShareServiceError as exc:
            return build_error_result("topic", exc.info)
        except Exception:
            logger.exception("创建话题分享时发生未处理异常")
            return build_error_result(
                "topic",
                ShareErrorInfo(
                    code="unknown", message="The topic share could not be created because of an unexpected error."
                ),
            )
        return build_creation_result(result)

    async def get_before_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        arguments: dict[str, object] | None = None,
    ) -> dict[str, object]:
        return before_create(tool_name, tool_context, arguments, "topic")

    async def get_tool_detail(
        self,
        tool_context: ToolContext,
        result: ToolResult,
        arguments: dict[str, object] | None = None,
    ) -> ToolDetail:
        return build_creation_detail(result, arguments, "create_topic_share.md")

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: dict[str, object] | None = None,
    ) -> dict[str, object]:
        return after_create(tool_name, tool_context, result, execution_time, arguments, "topic")


__all__ = ["CreateTopicShare", "CreateTopicShareParams"]
