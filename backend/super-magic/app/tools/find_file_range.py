"""Locate one replacement range before a large edit is generated."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from pydantic import Field

from agentlang.config.config import config
from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from agentlang.utils.token_estimator import num_tokens_from_string, truncate_text_by_token
from app.core.context.agent_context import AgentContext
from app.core.entity.message.server_message import DisplayType, ToolDetail
from app.i18n import i18n
from agentlang.logger import get_logger
from app.service.html_app_memory_service import is_html_app_memory_path
from app.tools.abstract_file_tool import AbstractFileTool
from app.tools.core import BaseToolParams, tool
from app.tools.file_edit_store import FileEditStore
from app.tools.workspace_tool import WorkspaceTool
from app.utils.async_file_utils import async_exists
from app.tools.utils.file_change_stats import read_text_snapshot
from app.utils.line_number_handler import LineNumberHandler
from app.utils.replace_range_resolver import RangeMatchError, resolve_replace_range

logger = get_logger(__name__)


class FindFileRangeParams(BaseToolParams):
    file_path: str = Field(
        ...,
        description="<!--zh: 要查找范围的文件绝对路径-->The absolute path of the file to inspect",
    )
    replace_start: str = Field(
        ...,
        description="<!--zh: 替换范围的起始锚点；该锚点会包含在范围内，可为空-->Start anchor of the replacement range, included in the range; may be empty",
    )
    replace_end: str = Field(
        ...,
        description="<!--zh: 替换范围的结束锚点；该锚点会包含在范围内，可为空-->End anchor of the replacement range, included in the range; may be empty",
    )


@tool()
class FindFileRange(AbstractFileTool[FindFileRangeParams], WorkspaceTool[FindFileRangeParams]):
    """Find and reserve one file range for a later edit."""

    def get_prompt_hint(self) -> str:
        return """\
<!--zh
大段文本编辑先调用本工具定位范围，再调用 edit_file_range。
- replace_start 和 replace_end 必须逐字复制文件内容；两者不能同时为空。
- 本工具成功后返回 8 位 range_id。下一步只传 range_id 和 new_string。
- range_id 只能成功应用一次，只对当前 AgentContext 有效；沙盒重启或上下文重置后必须重新查找。
- 定位失败时不会保存新文本；先修正锚点后重试本工具。
-->
For a large edit, call this tool first and then call edit_file_range.
- Copy replace_start and replace_end exactly from the file. They cannot both be empty.
- On success this tool returns an 8-character range_id. The next call only needs range_id and new_string.
- A range_id can be applied successfully once and is valid only in the current AgentContext. Find the range again after a sandbox restart or context reset.
- If lookup fails, no replacement text is stored. Fix the anchors and retry this tool.
"""

    async def execute(self, tool_context: ToolContext, params: FindFileRangeParams) -> ToolResult:
        try:
            resolved = self.resolve_path_fuzzy(params.file_path)
            file_path = resolved.path
            warnings: list[str] = []
            if resolved.warning:
                warnings.append(resolved.warning)
            self._strip_line_number_prefixes(params, warnings)

            if params.replace_start == "" and params.replace_end == "":
                tool_context.set_metadata("error_type", "edit_file.error_validation_failed")
                return ToolResult.error(
                    "replace_start and replace_end cannot both be empty.",
                    data={"error_code": "invalid_anchors"},
                )
            if is_html_app_memory_path(file_path):
                return ToolResult.error(
                    "MICRO-APP.md is managed by update_html_app_memory. Use that tool instead of find_file_range.",
                    data={"error_code": "write_forbidden"},
                )
            if not await async_exists(file_path):
                tool_context.set_metadata("error_type", "edit_file.error_file_not_exist")
                return ToolResult.error(
                    f"File does not exist: {file_path}\nUse write_file to create new files.",
                    data={"error_code": "file_unavailable"},
                )

            snapshot = await read_text_snapshot(file_path)
            try:
                resolution = resolve_replace_range(
                    snapshot.content,
                    params.replace_start,
                    params.replace_end,
                )
            except RangeMatchError as match_error:
                tool_context.set_metadata("error_type", "edit_file.error_match_failed")
                return ToolResult.error(
                    f"Range lookup failed: {match_error}\n"
                    "Copy both anchors from the current file and make an ambiguous anchor more specific.",
                    data={"error_code": match_error.code},
                )

            matched_range = resolution.matched_range
            warnings.extend(resolution.warnings)
            context = tool_context.get_extension_typed("agent_context", AgentContext)
            record = await FileEditStore.create_range(
                context,
                file_path=file_path,
                start_index=matched_range.start_index,
                end_index=matched_range.end_index,
                start_line=matched_range.start_line,
                end_line=matched_range.end_line,
                source_content=snapshot.content,
            )
            await self.get_horizon(tool_context).record_file_observation(
                file_path,
                tool_name="find_file_range",
                metadata={"file_edit_range_id": record.range_id},
            )

            selected = snapshot.content[matched_range.start_index:matched_range.end_index]
            preview, preview_truncated = self._preview(
                snapshot.content,
                matched_range.start_index,
                matched_range.end_index,
            )
            output = (
                f"Range found in {file_path}.\n"
                f"range_id: {record.range_id}\n"
                f"Lines: {record.start_line}-{record.end_line}\n"
                f"Matched characters: {len(selected)}\n"
                "Use edit_file_range with this range_id and the new_string to replace it. "
                "The range_id is single-use and valid only in the current AgentContext."
            )
            if preview:
                output += f"\n\nMatched range preview:\n{preview}"
            if warnings:
                output += "\n\n" + "\n\n".join(warnings)

            return ToolResult(
                content=output,
                data={
                    "range_id": record.range_id,
                    "file_path": record.file_path,
                    "start_line": record.start_line,
                    "end_line": record.end_line,
                    "character_count": len(selected),
                    "preview_truncated": preview_truncated,
                },
                extra_info={"file_path": record.file_path, "range_id": record.range_id},
            )
        except Exception as error:
            logger.exception("Failed to find file range: %s", error)
            tool_context.set_metadata("error_type", "edit_file.error_unexpected")
            return ToolResult.error(
                "The find_file_range tool encountered an unexpected error. Re-read the current file and retry.",
                data={"error_code": "storage_unavailable"},
            )

    @staticmethod
    def _preview_limit() -> int:
        value = config.get("file_edit.range_preview_max_tokens")
        if isinstance(value, bool) or value is None:
            raise ValueError("Missing file_edit.range_preview_max_tokens configuration.")
        limit = int(value)
        if limit <= 0:
            raise ValueError("file_edit.range_preview_max_tokens must be greater than zero.")
        return limit

    @classmethod
    def _preview(cls, content: str, start_index: int, end_index: int) -> tuple[str, bool]:
        selected = content[start_index:end_index]
        if not selected:
            return "(empty range)", False
        context_lines = cls._context_line_limit()
        before_start = start_index
        for _ in range(context_lines):
            previous_break = content.rfind("\n", 0, max(0, before_start - 1))
            before_start = 0 if previous_break < 0 else previous_break + 1
        after_end = end_index
        for _ in range(context_lines):
            next_break = content.find("\n", after_end)
            after_end = len(content) if next_break < 0 else next_break + 1
        before = content[before_start:start_index]
        after = content[end_index:after_end]
        parts = []
        if before:
            parts.append(f"Context before:\n{before}")
        parts.append(f"Selected range:\n{selected}")
        if after:
            parts.append(f"Context after:\n{after}")
        preview, truncated = truncate_text_by_token("\n\n".join(parts), cls._preview_limit())
        return preview, truncated

    @staticmethod
    def _context_line_limit() -> int:
        value = config.get("file_edit.range_preview_context_lines")
        if isinstance(value, bool) or value is None:
            raise ValueError("Missing file_edit.range_preview_context_lines configuration.")
        limit = int(value)
        if limit < 0:
            raise ValueError("file_edit.range_preview_context_lines must be non-negative.")
        return limit

    @staticmethod
    def _strip_line_number_prefixes(params: FindFileRangeParams, warnings: list[str]) -> None:
        start, had_start, _ = LineNumberHandler.detect_and_strip(params.replace_start)
        if had_start:
            params.replace_start = start
            warnings.append("Line-number prefixes were removed from replace_start.")
        end, had_end, _ = LineNumberHandler.detect_and_strip(params.replace_end)
        if had_end:
            params.replace_end = end
            warnings.append("Line-number prefixes were removed from replace_end.")

    async def get_tool_detail(
        self,
        tool_context: ToolContext,
        result: ToolResult,
        arguments: dict[str, Any] | None = None,
    ) -> ToolDetail:
        file_path = str(result.extra_info.get("file_path", "")) if result.extra_info else ""
        file_name = os.path.basename(file_path) if file_path else "file"
        detail = result.content if result.ok else "Range lookup failed. Read the current file and retry with exact anchors."
        return ToolDetail(
            type=DisplayType.MD,
            data=await self._build_file_content(
                file_path=file_path,
                file_name=f"{file_name}.range.md",
                content=f"## File range\n\n{detail}",
            ),
        )

    def _get_remark_content(self, result: ToolResult, arguments: dict[str, Any] | None = None) -> str:
        if result.ok and result.data.get("range_id"):
            return str(result.data["range_id"])
        return i18n.translate("find_file_range.error", category="tool.messages")

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: dict[str, Any] | None = None,
    ) -> dict[str, str]:
        result.use_custom_remark = True
        if not result.ok:
            return {
                "action": i18n.translate("find_file_range", category="tool.actions"),
                "remark": i18n.translate("find_file_range.error", category="tool.messages"),
            }
        return {
            "action": i18n.translate("find_file_range", category="tool.actions"),
            "remark": self._get_remark_content(result, arguments),
        }
