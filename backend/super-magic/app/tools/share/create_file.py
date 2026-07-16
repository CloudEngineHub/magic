"""创建工作区文件分享的 Code Mode 工具。"""

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


class CreateFileShareParams(BaseCreateShareParams):
    """创建文件分享的扁平参数。"""

    file_paths: list[str] = Field(
        ...,
        min_length=1,
        description="Workspace-relative paths of every file to share. Share only files explicitly requested by the user.",
    )
    entry_file_path: str = Field(
        ...,
        min_length=1,
        description="Required default file to open. It must identify one of the files in file_paths.",
    )
    allow_copy: bool = Field(
        True,
        description="Allow viewers to copy the shared files into their own workspace.",
    )
    show_file_list: bool = Field(
        True,
        description="Show the shared file list to viewers.",
    )
    hide_super_magic_watermark: bool = Field(
        False,
        description=(
            'Hide only the bottom-right "Created by Super Magic" watermark. This requires VIP and does not hide the top logo or all branding.'
        ),
    )
    immersive: bool = Field(
        False,
        description="Open the shared page in immersive mode with the page header hidden.",
    )
    resource_id: str | None = Field(
        None,
        min_length=1,
        max_length=64,
        description="Existing active share resource ID to update. Provide it only after selecting the share the user wants to modify.",
    )


@tool(name="create_file_share", code_mode_only=True)
class CreateFileShare(BaseTool[CreateFileShareParams]):
    """Create or update a password, team, or explicitly public share for workspace files."""

    name = "create_file_share"

    async def execute(self, tool_context: ToolContext, params: CreateFileShareParams) -> ToolResult:
        options = build_share_options(
            params,
            allow_copy=params.allow_copy,
            show_file_list=params.show_file_list,
            hide_super_magic_watermark=params.hide_super_magic_watermark,
            immersive=params.immersive,
            resource_id=params.resource_id,
            update_existing=params.update_existing,
        )
        try:
            result = await ShareService().create_file_share(
                tool_context,
                params.file_paths,
                params.entry_file_path,
                options,
            )
        except asyncio.CancelledError:
            raise
        except ShareServiceError as exc:
            return build_error_result("files", exc.info)
        except Exception:
            logger.exception("创建文件分享时发生未处理异常")
            return build_error_result(
                "files",
                ShareErrorInfo(
                    code="unknown", message="The file share could not be created because of an unexpected error."
                ),
            )
        return build_creation_result(result)

    async def get_before_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        arguments: dict[str, object] | None = None,
    ) -> dict[str, object]:
        return before_create(tool_name, tool_context, arguments, "files")

    async def get_tool_detail(
        self,
        tool_context: ToolContext,
        result: ToolResult,
        arguments: dict[str, object] | None = None,
    ) -> ToolDetail:
        return build_creation_detail(result, arguments, "create_file_share.md")

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: dict[str, object] | None = None,
    ) -> dict[str, object]:
        return after_create(tool_name, tool_context, result, execution_time, arguments, "files")


__all__ = ["CreateFileShare", "CreateFileShareParams"]
