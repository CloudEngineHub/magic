"""创建整个项目分享的 Code Mode 工具。"""

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


class CreateProjectShareParams(BaseCreateShareParams):
    """创建项目分享的扁平参数。"""

    entry_file_path: str = Field(
        ...,
        min_length=1,
        description="Required current-project workspace file to open first when viewers enter the shared project.",
    )
    allow_copy: bool = Field(
        True,
        description="Allow viewers to copy the shared project into their own workspace.",
    )
    hide_super_magic_watermark: bool = Field(
        False,
        description=(
            'Hide only the bottom-right "Created by Super Magic" watermark. This requires VIP and does not hide the top logo or all branding.'
        ),
    )
    immersive: bool = Field(
        False,
        description="Open the shared project in immersive mode with the page header hidden.",
    )
    resource_id: str | None = Field(
        None,
        min_length=1,
        max_length=64,
        description="Existing active share resource ID to update. Provide it only after selecting the share the user wants to modify.",
    )


@tool(name="create_project_share", code_mode_only=True)
class CreateProjectShare(BaseTool[CreateProjectShareParams]):
    """Create or update a share for the entire current project with a required entry file."""

    name = "create_project_share"

    async def execute(self, tool_context: ToolContext, params: CreateProjectShareParams) -> ToolResult:
        options = build_share_options(
            params,
            allow_copy=params.allow_copy,
            show_file_list=True,
            hide_super_magic_watermark=params.hide_super_magic_watermark,
            immersive=params.immersive,
            resource_id=params.resource_id,
            update_existing=params.update_existing,
        )
        try:
            result = await ShareService().create_project_share(tool_context, params.entry_file_path, options)
        except asyncio.CancelledError:
            raise
        except ShareServiceError as exc:
            return build_error_result("project", exc.info)
        except Exception:
            logger.exception("创建项目分享时发生未处理异常")
            return build_error_result(
                "project",
                ShareErrorInfo(
                    code="unknown", message="The project share could not be created because of an unexpected error."
                ),
            )
        return build_creation_result(result)

    async def get_before_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        arguments: dict[str, object] | None = None,
    ) -> dict[str, object]:
        return before_create(tool_name, tool_context, arguments, "project")

    async def get_tool_detail(
        self,
        tool_context: ToolContext,
        result: ToolResult,
        arguments: dict[str, object] | None = None,
    ) -> ToolDetail:
        return build_creation_detail(result, arguments, "create_project_share.md")

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: dict[str, object] | None = None,
    ) -> dict[str, object]:
        return after_create(tool_name, tool_context, result, execution_time, arguments, "project")


__all__ = ["CreateProjectShare", "CreateProjectShareParams"]
