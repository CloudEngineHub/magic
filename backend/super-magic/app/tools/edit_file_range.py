"""Apply one previously located file range."""

from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import Any

from pydantic import Field, model_validator

from agentlang.context.tool_context import ToolContext
from agentlang.logger import get_logger
from agentlang.tools.tool_result import ToolResult
from agentlang.utils.syntax_checker import SyntaxChecker
from app.core.context.agent_context import AgentContext
from app.core.entity.message.server_message import DisplayType, ToolDetail
from app.i18n import i18n
from app.service.html_app_memory_service import is_html_app_memory_path
from app.tools.abstract_file_tool import AbstractFileTool
from app.tools.core import BaseToolParams, tool
from app.tools.file_edit_store import FileEditRangeRecord, FileEditStore
from app.tools.utils.file_change_stats import (
    FileChangeMetrics,
    FileTextSnapshot,
    format_file_change_metrics,
    measure_text,
    read_text_snapshot,
)
from app.tools.workspace_tool import WorkspaceTool
from app.utils.async_file_utils import async_exists, async_write_text
from app.utils.diff_generator import DiffGenerator
from app.utils.line_number_handler import LineNumberHandler

logger = get_logger(__name__)


class EditFileRangeParams(BaseToolParams):
    range_id: str = Field(
        ...,
        description="<!--zh: find_file_range 返回的 8 位范围编号，只能成功使用一次；沙盒重启、重建或会话重置后失效，必须重新查找-->Single-use 8-character ID from find_file_range. Invalid after restart, rebuild, or session reset; obtain a new ID",
    )
    new_string: str | None = Field(
        default=None,
        description="<!--zh: 替换已定位范围的新内容；可以为空字符串表示删除范围-->New content for the located range; an empty string deletes the range",
    )
    replacement_id: str | None = Field(
        default=None,
        description="<!--zh: 当前运行环境和同一文件内之前编辑失败时返回的 replacement_id；与 new_string 二选一，重启或清理后失效-->A replacement_id from an earlier failed edit for the same file and runtime; use it instead of new_string. It expires after restart or cleanup",
    )

    @model_validator(mode="after")
    def validate_replacement_input(self) -> "EditFileRangeParams":
        if (self.new_string is None) == (self.replacement_id is None):
            raise ValueError("Provide exactly one of new_string or replacement_id.")
        return self


@tool()
class EditFileRange(AbstractFileTool[EditFileRangeParams], WorkspaceTool[EditFileRangeParams]):
    """Apply a single-use range found by find_file_range."""

    def get_prompt_hint(self) -> str:
        return """\
<!--zh
本工具只接受 find_file_range 返回的 range_id，不再接受文件路径或锚点。
- 正常流程：先调用 find_file_range，再传 range_id 和 new_string。
- range_id 只能成功应用一次；当前文件内容变化、沙盒重启或上下文重置后会失效，必须重新查找。
- 如果工具返回 replacement_id，重新查找得到新的 range_id 后，可在当前运行环境和同一文件内传 replacement_id 复用已经生成的新内容，避免再次输出长文本；重启、重置或清理后必须重新生成。
- 只有范围定位失败或文件版本变化时才使用本工具；短文本优先使用 edit_file，多个短修改使用 multi_edit_file。
-->
This tool accepts only a range_id returned by find_file_range. It does not accept a file path or anchors.
- Normal flow: call find_file_range, then pass its range_id and new_string.
- A range_id can be applied successfully once. It becomes invalid when the file changes, the sandbox restarts, or the context is reset; find the range again.
- If the tool returns a replacement_id, use it with a new range_id for the same file and current runtime to reuse already generated text. It is unavailable after restart, reset, or cleanup.
- Use this tool for large located ranges. Prefer edit_file for short edits and multi_edit_file for multiple short edits.
"""

    async def execute(self, tool_context: ToolContext, params: EditFileRangeParams) -> ToolResult:
        try:
            return await self._execute(tool_context, params)
        except asyncio.CancelledError:
            raise
        except Exception as error:
            logger.exception("Failed to edit file range: %s", error)
            tool_context.set_metadata("error_type", "edit_file.error_unexpected")
            return ToolResult.error(
                "The edit_file_range tool encountered an unexpected error. "
                "Call find_file_range again and retry with the returned range_id.",
                data={"error_code": "write_failed"},
            )

    async def _execute(self, tool_context: ToolContext, params: EditFileRangeParams) -> ToolResult:
        context = tool_context.get_extension_typed("agent_context", AgentContext)
        record = await FileEditStore.get_range(context, params.range_id)
        if record is None:
            tool_context.set_metadata("error_type", "edit_file.error_range_unavailable")
            return self._error(
                "range_id is invalid, expired, or belongs to another AgentContext. "
                "Call find_file_range again and use its new range_id.",
                error_code="range_unavailable",
            )
        if record.state == "applied":
            tool_context.set_metadata("error_type", "edit_file.error_range_used")
            return self._error(
                "This range_id has already been used successfully. Call find_file_range again for another edit.",
                error_code="already_applied",
                status="already_applied",
            )
        if record.state != "ready":
            tool_context.set_metadata("error_type", "edit_file.error_range_unavailable")
            return self._error(
                "This range_id is no longer available. Call find_file_range again before editing.",
                error_code="range_unavailable",
            )

        replacement_id = params.replacement_id
        if replacement_id is not None:
            replacement = await FileEditStore.get_replacement(context, replacement_id)
            if replacement is None:
                tool_context.set_metadata("error_type", "edit_file.error_replacement_unavailable")
                return self._error(
                    "replacement_id is invalid or expired. Regenerate the replacement text and retry with a new range_id.",
                    error_code="replacement_unavailable",
                )
            if replacement.file_path != record.file_path:
                tool_context.set_metadata("error_type", "edit_file.error_replacement_unavailable")
                return self._error("replacement_id belongs to another file.", error_code="replacement_conflict")
            new_string = replacement.value
        else:
            new_string = params.new_string or ""
            cleaned, had_line_numbers, _ = LineNumberHandler.detect_and_strip(new_string)
            if had_line_numbers:
                new_string = cleaned

        file_path = Path(record.file_path)
        if is_html_app_memory_path(file_path):
            return self._error(
                "MICRO-APP.md is managed by update_html_app_memory. Use that tool instead of edit_file_range.",
                error_code="write_forbidden",
            )
        if not await async_exists(file_path):
            tool_context.set_metadata("error_type", "edit_file.error_file_not_exist")
            return self._error(
                f"File does not exist: {file_path}. Use write_file to create new files.",
                error_code="file_unavailable",
            )

        write_started = False
        async with FileEditStore.path_lock(file_path, context.get_interruption_event()):
            # Reload while holding the path lock so parallel calls cannot apply one range twice.
            record = await FileEditStore.get_range(context, params.range_id)
            if record is None or record.state != "ready":
                tool_context.set_metadata("error_type", "edit_file.error_range_used")
                return self._error(
                    "This range_id is no longer available. Call find_file_range again.",
                    error_code="range_unavailable",
                )
            await FileEditStore.set_range_state(context, record, "applying")
            try:
                original_snapshot = await read_text_snapshot(file_path)
                if FileEditStore.content_digest(original_snapshot.content) != record.source_digest:
                    await FileEditStore.set_range_state(context, record, "invalid")
                    recovery_id = replacement_id or await FileEditStore.save_replacement(
                        context,
                        file_path=file_path,
                        value=new_string,
                        replacement_id=replacement_id,
                    )
                    tool_context.set_metadata("error_type", "edit_file.error_file_modified")
                    return self._error(
                        "The file changed after find_file_range, so the range_id is invalid. "
                        f"Call find_file_range again, then reuse replacement_id={recovery_id}.",
                        error_code="range_stale",
                        replacement_id=recovery_id,
                    )

                original_content = original_snapshot.content
                if not 0 <= record.start_index <= record.end_index <= len(original_content):
                    await FileEditStore.set_range_state(context, record, "invalid")
                    tool_context.set_metadata("error_type", "edit_file.error_range_unavailable")
                    return self._error(
                        "The saved range is outside the current file. Call find_file_range again.",
                        error_code="range_unavailable",
                    )

                new_content = (
                    original_content[:record.start_index]
                    + new_string
                    + original_content[record.end_index:]
                )
                if new_content == original_content:
                    await FileEditStore.set_range_state(context, record, "applied")
                    if replacement_id is not None:
                        await FileEditStore.consume_replacement(replacement_id)
                    return ToolResult(
                        content="No changes made. The replacement content already matches the selected range.",
                        data={"status": "unchanged"},
                        extra_info={"file_path": str(file_path), "range_id": record.range_id},
                    )

                async with self._file_versioning_context(tool_context, file_path):
                    new_content = await self._write_file(file_path, new_content)
                    write_started = True

                await FileEditStore.set_range_state(context, record, "applied")
                if replacement_id is not None:
                    await FileEditStore.consume_replacement(replacement_id)
            except asyncio.CancelledError:
                raise
            except Exception:
                if not write_started:
                    await FileEditStore.set_range_state(context, record, "ready")
                raise

        return await self._build_success_result(
            file_path=file_path,
            record=record,
            replacement=new_string,
            original_snapshot=original_snapshot,
            new_content=new_content,
        )

    async def _build_success_result(
        self,
        *,
        file_path: Path,
        record: FileEditRangeRecord,
        replacement: str,
        original_snapshot: FileTextSnapshot,
        new_content: str,
    ) -> ToolResult:
        ai_warnings: list[str] = []
        syntax_result = await SyntaxChecker.check_syntax(str(file_path), new_content)
        if not syntax_result.is_valid:
            errors_str = "\n".join(syntax_result.errors)
            ai_warnings.append(f"WARNING: Syntax errors detected in the modified file:\n{errors_str}")

        stats = DiffGenerator.calculate_change_stats(
            original_snapshot.content,
            new_content,
            old_size=original_snapshot.metrics.byte_count,
        )
        summary_diff = DiffGenerator.generate_summary_diff(str(file_path.name), stats)
        full_diff = DiffGenerator.generate_unified_diff(
            original_snapshot.content,
            new_content,
            str(file_path.name),
        )
        replaced_fragment = original_snapshot.content[record.start_index:record.end_index]
        replaced_line_count = 0 if replaced_fragment == "" else replaced_fragment.count("\n") + 1
        new_line_count = 0 if replacement == "" else replacement.count("\n") + 1
        output = (
            f"File updated: {file_path.resolve()}\n"
            f"Range replaced: lines {record.start_line}-{record.end_line} "
            f"({replaced_line_count} line(s) replaced with {new_line_count} line(s))\n"
        )
        if stats["added_lines"] > 0:
            output += f"Lines added: +{stats['added_lines']}\n"
        if stats["deleted_lines"] > 0:
            output += f"Lines deleted: -{stats['deleted_lines']}\n"
        if stats["modified_lines"] > 0:
            output += f"Lines modified: ~{stats['modified_lines']}\n"
        if stats["size_change"] != 0:
            sign = "+" if stats["size_change"] > 0 else ""
            output += f"Size change: {sign}{stats['size_change']} bytes ({stats['old_size']}→{stats['new_size']})\n"
        if summary_diff:
            output += f"\n--- Change Summary ---\n{summary_diff}"
        output += "\n" + format_file_change_metrics(
            FileChangeMetrics(original_snapshot.metrics, measure_text(new_content, stats["new_size"])),
            include_bytes=False,
        )
        if ai_warnings:
            output += "\n\n" + "\n\n".join(ai_warnings)
        return ToolResult(
            content=output,
            data={"status": "applied"},
            extra_info={"diff": full_diff, "file_path": str(file_path), "range_id": record.range_id},
        )

    @staticmethod
    def _error(
        message: str,
        *,
        error_code: str,
        replacement_id: str | None = None,
        status: str | None = None,
    ) -> ToolResult:
        data: dict[str, str] = {"error_code": error_code}
        if replacement_id:
            data["replacement_id"] = replacement_id
        if status:
            data["status"] = status
        return ToolResult.error(message, data=data)

    async def _write_file(self, file_path: Path, content: str) -> str:
        if content and not content.endswith("\n"):
            content += "\n"
        await async_write_text(file_path, content)
        return content

    async def get_tool_detail(
        self,
        tool_context: ToolContext,
        result: ToolResult,
        arguments: dict[str, Any] | None = None,
    ) -> ToolDetail:
        file_path = str(result.extra_info.get("file_path", "")) if result.extra_info else ""
        file_name = os.path.basename(file_path) if file_path else "file"
        if result.ok and result.extra_info and result.extra_info.get("diff"):
            content = f"## File Edit: {file_name}\n\n```diff\n{result.extra_info['diff']}\n```"
        else:
            content = f"## File Edit: {file_name}\n\n{result.content}"
        return ToolDetail(
            type=DisplayType.MD,
            data=await self._build_file_content(
                file_path=file_path,
                file_name=f"{file_name}.diff",
                content=content,
            ),
        )

    def _get_remark_content(self, result: ToolResult, arguments: dict[str, Any] | None = None) -> str:
        if result.ok and result.extra_info.get("file_path"):
            return os.path.basename(str(result.extra_info["file_path"]))
        return i18n.translate("edit_file.error_no_file", category="tool.messages")

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
            error_type = tool_context.get_metadata("error_type")
            remark = i18n.translate(error_type or "edit_file.error", category="tool.messages")
            return {
                "action": i18n.translate("edit_file_range", category="tool.actions"),
                "remark": remark,
            }
        return {
            "action": i18n.translate("edit_file_range", category="tool.actions"),
            "remark": self._get_remark_content(result, arguments),
        }
