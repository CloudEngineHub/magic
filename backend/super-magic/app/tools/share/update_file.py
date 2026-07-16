"""局部更新活动文件分享的 Code Mode 工具。"""

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


class UpdateFileShareParams(BaseUpdateShareParams):
    """文件分享支持的扁平局部更新参数。"""

    file_paths: list[str] | None = Field(
        None,
        min_length=1,
        description=(
            "Complete replacement list of workspace-relative shared file paths. Omit to keep the current files. "
            "When provided, entry_file_path is also required."
        ),
    )
    entry_file_path: str | None = Field(
        None,
        min_length=1,
        description=(
            "New default file to open. With file_paths, it must be in the replacement set. Without file_paths, "
            "it must already be included in the share."
        ),
    )
    allow_copy: bool | None = Field(
        None,
        description="Whether viewers may copy the shared files into their workspace. Omit to keep it.",
    )
    show_file_list: bool | None = Field(
        None,
        description="Whether viewers may see the shared file list. Omit to keep it.",
    )
    hide_super_magic_watermark: bool | None = Field(
        None,
        description=(
            'Whether to hide the bottom-right "Created by Super Magic" watermark. True requires VIP. Omit to keep it.'
        ),
    )
    immersive: bool | None = Field(
        None,
        description=(
            "Whether to show the entry file fullscreen while hiding both the share page header and the file preview "
            "header. Omit to keep it."
        ),
    )


@tool(name="update_file_share", code_mode_only=True)
class UpdateFileShare(BaseTool[UpdateFileShareParams]):
    """Modify selected settings of one active file share while preserving all omitted settings."""

    name = "update_file_share"

    async def execute(self, tool_context: ToolContext, params: UpdateFileShareParams) -> ToolResult:
        options = build_update_options(
            params,
            file_paths=params.file_paths,
            entry_file_path=params.entry_file_path,
            allow_copy=params.allow_copy,
            show_file_list=params.show_file_list,
            hide_super_magic_watermark=params.hide_super_magic_watermark,
            immersive=params.immersive,
        )
        try:
            detail = await ShareUpdateService().update_file_share(tool_context, params.share_ref, options)
        except asyncio.CancelledError:
            raise
        except ShareServiceError as exc:
            return build_management_error("update", "files", exc.info)
        except Exception:
            logger.exception("更新文件分享时发生未处理异常")
            return build_management_error(
                "update",
                "files",
                ShareErrorInfo(
                    code="unknown",
                    message="The file share could not be updated because of an unexpected error.",
                ),
            )
        return build_management_result(detail, "updated")

    async def get_tool_detail(
        self,
        tool_context: ToolContext,
        result: ToolResult,
        arguments: dict[str, object] | None = None,
    ) -> ToolDetail:
        return build_management_detail(result, "update_file_share.md")

    async def get_before_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        arguments: dict[str, object] | None = None,
    ) -> dict[str, object]:
        return before_update(tool_name, tool_context, arguments, "files")

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: dict[str, object] | None = None,
    ) -> dict[str, object]:
        return after_update(tool_name, tool_context, result, execution_time, arguments, "files")


__all__ = ["UpdateFileShare", "UpdateFileShareParams"]
