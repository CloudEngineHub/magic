"""删除分享记录并使链接失效的 Code Mode 工具。"""

from __future__ import annotations

import asyncio

from pydantic import ConfigDict, Field

from agentlang.context.tool_context import ToolContext
from agentlang.logger import get_logger
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import ToolDetail
from app.tools.core import BaseTool, BaseToolParams, tool

from .display import (
    after_delete,
    before_delete,
    build_confirmation_error,
    build_deletion_detail,
    build_deletion_result,
    build_error_result,
)
from .models import ShareErrorInfo, ShareServiceError
from .service import ShareService

logger = get_logger(__name__)


class DeleteShareParams(BaseToolParams):
    """删除分享所需的显式引用和用户授权。"""

    model_config = ConfigDict(extra="forbid")

    share_ref: str = Field(
        ...,
        min_length=1,
        description=(
            "Share resource ID. For a topic share, pass its topic ID directly. "
            "A complete /share/files/{id} or /share/topic/{id} URL is also accepted."
        ),
    )
    confirmed: bool = Field(
        ...,
        description=(
            "Set true only after the user explicitly authorizes making this specified share unavailable. "
            "If authorization is unclear, ask the user first."
        ),
    )


@tool(name="delete_share", code_mode_only=True)
class DeleteShare(BaseTool[DeleteShareParams]):
    """Make a share unavailable without deleting its source topic, files, or project."""

    name = "delete_share"

    async def check_execution_permission(
        self,
        tool_context: ToolContext,
        params: DeleteShareParams,
    ) -> ToolResult | None:
        if params.confirmed:
            return None
        return build_confirmation_error(params.share_ref)

    async def execute(self, tool_context: ToolContext, params: DeleteShareParams) -> ToolResult:
        try:
            result = await ShareService().delete_share(tool_context, params.share_ref)
        except asyncio.CancelledError:
            raise
        except ShareServiceError as exc:
            return build_error_result("share", exc.info)
        except Exception:
            logger.exception("删除分享时发生未处理异常")
            return build_error_result(
                "share",
                ShareErrorInfo(
                    code="unknown", message="The share could not be deleted because of an unexpected error."
                ),
            )
        return build_deletion_result(result)

    async def get_before_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        arguments: dict[str, object] | None = None,
    ) -> dict[str, object]:
        return before_delete(tool_name, tool_context, arguments)

    async def get_tool_detail(
        self,
        tool_context: ToolContext,
        result: ToolResult,
        arguments: dict[str, object] | None = None,
    ) -> ToolDetail:
        return build_deletion_detail(result, arguments)

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: dict[str, object] | None = None,
    ) -> dict[str, object]:
        return after_delete(tool_name, tool_context, result, execution_time, arguments)


__all__ = ["DeleteShare", "DeleteShareParams"]
