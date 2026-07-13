"""移除已持久化第三方 CLI 的 Code Mode 工具。"""

from __future__ import annotations

from typing import Optional

from pydantic import Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.service.cli_manager import CliManagerError, CliManagerService
from app.tools.core import BaseTool, BaseToolParams, tool

from ._base import CliManagerToolMixin
from .display import (
    as_mapping,
    as_sequence,
    format_optional,
    get_argument_name,
    translate_action,
    translate_error,
    translate_message,
)


class CliManagerRemoveParams(BaseToolParams):
    """移除已持久化 CLI 的参数。"""

    name: Optional[str] = Field(
        None,
        description="Name of the persisted CLI to remove.",
    )
    remove_state: bool = Field(
        False,
        description="Whether to also delete the CLI's persisted configuration state directory. Defaults to false.",
    )
    confirmed: bool = Field(
        False,
        description="Set true only after the user explicitly approves removal.",
    )


@tool(name="cli_manager_remove", code_mode_only=True)
class CliManagerRemove(BaseTool[CliManagerRemoveParams], CliManagerToolMixin):
    """Remove a third-party CLI's persisted command entry points and optional state directory."""

    async def execute(self, tool_context: ToolContext, params: CliManagerRemoveParams) -> ToolResult:
        """在用户明确确认后移除已持久化 CLI。"""
        try:
            info = await CliManagerService().remove(
                name=params.name or "",
                remove_state=params.remove_state,
                confirmed=params.confirmed,
            )
        except CliManagerError as exc:
            return self.error_result("remove", exc, params.model_dump())

        content = f"CLI persistence removed: {info['name']}."
        return ToolResult(content=content, extra_info=info, data=info)

    async def get_before_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        arguments: dict[str, object] | None = None,
    ) -> dict[str, object]:
        """构建用户可见的工具调用前提示。"""
        name = get_argument_name(arguments)
        return {
            "tool_name": tool_name,
            "action": translate_action(tool_name),
            "remark": translate_message("remove.before", name=format_optional(name)),
        }

    async def get_tool_detail(
        self,
        tool_context: ToolContext,
        result: ToolResult,
        arguments: dict[str, object] | None = None,
    ) -> ToolDetail | None:
        """构建用户可见的 CLI 移除详情。"""
        info = as_mapping(result.extra_info)
        removed_paths = as_sequence(info.get("removed_paths"))
        remove_state = info.get("remove_state")
        if remove_state is None:
            remove_state = bool((arguments or {}).get("remove_state"))
        lines = [
            f"# {translate_message('detail.remove_success_title' if result.ok else 'detail.remove_failed_title')}",
            "",
            f"- {translate_message('detail.name')}: `{format_optional(info.get('name') or get_argument_name(arguments))}`",
            f"- {translate_message('detail.remove_state')}: {translate_message('detail.yes' if remove_state else 'detail.no')}",
        ]
        if result.ok:
            lines.append(f"- {translate_message('detail.removed_paths')}: {len(removed_paths)}")
        else:
            lines.append(f"- {translate_message('detail.error')}: {translate_error(info)}")
        return ToolDetail(type=DisplayType.MD, data=FileContent(file_name="cli_manager_remove.md", content="\n".join(lines)))

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: dict[str, object] | None = None,
    ) -> dict[str, object]:
        """构建用户可见的工具调用后提示。"""
        info = as_mapping(result.extra_info)
        name = str(info.get("name") or get_argument_name(arguments))
        if result.ok:
            remark = translate_message("remove.after_success", name=format_optional(name))
        else:
            remark = translate_message("remove.after_failed", name=format_optional(name), error=translate_error(info))
        return {"tool_name": tool_name, "action": translate_action(tool_name), "remark": remark}
