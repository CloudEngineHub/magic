"""查看用户持久化第三方 CLI 的 Code Mode 工具。"""

from __future__ import annotations

from pydantic import ConfigDict, Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.service.cli_manager import CliManagerError, CliManagerService
from app.tools.core import BaseTool, BaseToolParams, tool

from ._base import CliManagerToolMixin
from .display import as_mapping, as_sequence, format_commands, translate_action, translate_error, translate_message


class CliManagerListParams(BaseToolParams):
    """查看用户持久化 CLI 的参数。"""

    model_config = ConfigDict(populate_by_name=True)

    with_validation: bool = Field(
        False,
        alias="validate",
        description="Whether to also verify that each shim and target command exists.",
    )


@tool(name="cli_manager_list", code_mode_only=True)
class CliManagerList(BaseTool[CliManagerListParams], CliManagerToolMixin):
    """List persisted third-party CLIs."""

    async def execute(self, tool_context: ToolContext, params: CliManagerListParams) -> ToolResult:
        """列出用户持久化 CLI 的注册表记录。"""
        try:
            info = await CliManagerService().list_items(validate=params.with_validation)
        except CliManagerError as exc:
            return self.error_result("list", exc, params.model_dump())

        items = info["items"]
        if not items:
            content = (
                "No user-managed persisted CLIs found. "
                "Runtime-provided CLIs are outside cli-manager and do not require adoption."
            )
        else:
            names = ", ".join(item["name"] for item in items)
            content = f"User-managed persisted CLIs: {names}."
        return ToolResult(content=content, extra_info=info, data=info)

    async def get_before_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        arguments: dict[str, object] | None = None,
    ) -> dict[str, object]:
        """构建用户可见的工具调用前提示。"""
        validate = bool((arguments or {}).get("validate") or (arguments or {}).get("with_validation"))
        return {
            "tool_name": tool_name,
            "action": translate_action(tool_name),
            "remark": translate_message("list.before", validate=translate_message("detail.yes" if validate else "detail.no")),
        }

    async def get_tool_detail(
        self,
        tool_context: ToolContext,
        result: ToolResult,
        arguments: dict[str, object] | None = None,
    ) -> ToolDetail | None:
        """构建用户可见的 CLI 列表详情。"""
        info = as_mapping(result.extra_info)
        items = as_sequence(info.get("items"))
        lines = [
            f"# {translate_message('detail.list_success_title' if result.ok else 'detail.list_failed_title')}",
            "",
            f"- {translate_message('detail.count')}: {info.get('count', len(items))}",
        ]
        if result.ok and items:
            lines.extend(
                [
                    "",
                    f"| {translate_message('detail.name')} | {translate_message('detail.commands')} | {translate_message('detail.status')} | {translate_message('detail.validation')} |",
                    "| --- | --- | --- | --- |",
                ]
            )
            for item in items:
                item_view = as_mapping(item)
                validation = as_mapping(item_view.get("validation"))
                validation_label = "-"
                if validation:
                    validation_label = translate_message("detail.ok" if validation.get("ok") else "detail.failed")
                lines.append(
                    f"| `{item_view.get('name', '')}` | `{format_commands(as_sequence(item_view.get('commands')))}` | `{item_view.get('status', '')}` | {validation_label} |"
                )
        if not result.ok:
            lines.append(f"- {translate_message('detail.error')}: {translate_error(info)}")
        return ToolDetail(type=DisplayType.MD, data=FileContent(file_name="cli_manager_list.md", content="\n".join(lines)))

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
        if result.ok:
            remark = translate_message("list.after_success", count=info.get("count", 0))
        else:
            remark = translate_message("list.after_failed", error=translate_error(info))
        return {"tool_name": tool_name, "action": translate_action(tool_name), "remark": remark}
