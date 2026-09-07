"""文件变化检测：对比整文件快照与当前文件内容，返回 <file> XML 块列表。

变化表达三级退化：
  1. diff + size + mtime — 有整文件快照且 diff 可控
  2. diff_summary + size + mtime — 有快照但 diff 太大
  3. summary + size + mtime — 无快照或无法读取当前文件

新增的全文表达复用真正的 ReadFile；只替换展示选择，不改变文件版本校验。
"""
from __future__ import annotations

import asyncio
import difflib
import html
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from agentlang.logger import get_logger
from agentlang.utils.token_estimator import num_tokens_from_string
from app.core.horizon.models import FileContextRecord, HorizonDisplayBudget, HorizonState
from app.utils.async_file_utils import async_read_text

logger = get_logger(__name__)


@dataclass(frozen=True)
class FileChangeBlock:
    # 只描述本文件将展示的块，以及完整展示时对应的正文。
    # MOCK DEMO：A -> B 的完整 diff 已展示，下一次可从 B 生成 diff；只有摘要时，
    # new_snapshot=None，不能把未交付的 B 当作模型已知全文。这里不控制编辑权限。
    path: str
    content: str
    new_snapshot: str | None = None


@dataclass
class FileChanges:
    changes: list[FileChangeBlock] = field(default_factory=list)
    omitted: int = 0

    @property
    def blocks(self) -> list[str]:
        blocks = [change.content for change in self.changes]
        if self.omitted:
            blocks.append(_omission_notice(self.omitted))
        return blocks


def _omission_notice(count: int) -> str:
    return f"<summary>{count} additional changed files exceeded the display budget. Inspect relevant files before relying on their previous contents.</summary>"


def _format_mtime(ms: float) -> str:
    if ms <= 0:
        return "unknown"
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def _build_size_tag(old_size: int, new_size: int) -> str:
    return f"  <size>{old_size:,} -> {new_size:,} bytes</size>"


def _build_mtime_tag(old_mtime_ms: float, new_mtime_ms: float) -> str:
    return f"  <mtime>{_format_mtime(old_mtime_ms)} -> {_format_mtime(new_mtime_ms)}</mtime>"


def _build_summary_block(
    path_str: str,
    summary: str,
    old_size: int,
    new_size: int,
    old_mtime_ms: float,
    new_mtime_ms: float,
) -> str:
    return (
        f'<file path="{html.escape(path_str, quote=True)}">\n'
        f"  <summary>{html.escape(summary)}</summary>\n"
        f"{_build_size_tag(old_size, new_size)}\n"
        f"{_build_mtime_tag(old_mtime_ms, new_mtime_ms)}\n"
        f"</file>"
    )


def _is_diff_payload_safe(diff_lines: list[str], max_tokens: int) -> bool:
    """只用 Token 判断正文大小；行数仍是事实统计，不能再作为折叠门槛。"""
    return num_tokens_from_string("\n".join(diff_lines)) <= max_tokens


async def _read_current_file(path: str) -> Optional[str]:
    """读取已通过大小判断的文本，失败时保留变化摘要。"""
    try:
        return await async_read_text(path)
    except Exception as error:
        logger.debug(f"[AgentHorizon] 当前文件正文不可读取 {path}: {error}")
        return None


def _notice(record: FileContextRecord, size: int, mtime: float, reason: str) -> FileChangeBlock:
    return FileChangeBlock(record.path, _build_summary_block(
        record.path, reason + ". Read the relevant file or sections if this change affects the task.",
        record.file_size_bytes, size, record.file_mtime_ms, mtime,
    ))


async def _try_full_read(
    record: FileContextRecord, current_content: str, size: int, mtime: float,
    max_tokens: int,
) -> FileChangeBlock | None:
    if num_tokens_from_string(current_content) > max_tokens:
        return None
    try:
        # 工具模块会在导入时注册；实际需要全文时再导入，避免启动期注册循环。
        from app.service.auto_read_file_service import AutoReadFileService

        result = await AutoReadFileService.read_changed_file(record.path, max_tokens)
        info = result.extra_info or {}
        # ReadFile 保留自己的截断与文件类型判断；完整结果才可作为全文表达。
        # 不传工具上下文，因此读取不会提前推进文件记录。两次读到的内容不同则留待下一轮。
        if not result.ok or info.get("was_truncated") or info.get("source_content") != current_content:
            return None
        body = info.get("raw_content")
        read_path = info.get("original_file_path")
        if not isinstance(body, str) or not isinstance(read_path, str) or Path(read_path).absolute() != Path(record.path).absolute():
            return None
        return FileChangeBlock(record.path, (
            f'<file path="{html.escape(record.path, quote=True)}">\n'
            '  <summary>The runtime called read_file. This complete current content replaces the previous file content; scope and authority are unchanged.</summary>\n'
            f"  <read_file_result>\n{html.escape(body, quote=False)}\n  </read_file_result>\n"
            f"{_build_size_tag(record.file_size_bytes, size)}\n"
            f"{_build_mtime_tag(record.file_mtime_ms, mtime)}\n</file>"
        ), current_content)
    except Exception as error:
        logger.debug(f"[AgentHorizon] 全文读取未完成 {record.path}: {error}")
        return None


async def _build_file_diff_block(
    record: FileContextRecord,
    current_size: int,
    current_mtime_ms: float,
    max_tokens: int,
    full_read_ratio: float,
) -> FileChangeBlock | None:
    """为单个文件构建完整的 <file> 块；保留大小、时间和可得的增删统计。"""
    current_content = await _read_current_file(record.path)
    if current_content is None:
        return _notice(record, current_size, current_mtime_ms, "The file changed, but current content could not be read")

    has_snapshot = bool(record.file_content) or record.metadata.get("snapshot_mode") == "full"
    if not has_snapshot:
        full_read = await _try_full_read(record, current_content, current_size, current_mtime_ms, max_tokens)
        return full_read or _notice(record, current_size, current_mtime_ms, "The file changed; no complete previous snapshot is available")

    old_lines = record.file_content.splitlines(keepends=True)
    new_lines = current_content.splitlines(keepends=True)
    if old_lines == new_lines:
        return _notice(record, current_size, current_mtime_ms, "The file version changed; its readable text matches the previous snapshot")
    diff_lines = list(difflib.unified_diff(
        old_lines, new_lines, fromfile=f"a/{Path(record.path).name}",
        tofile=f"b/{Path(record.path).name}", lineterm="",
    ))
    if not diff_lines:
        return None
    diff_text = "\n".join(diff_lines)
    diff_tokens = num_tokens_from_string(diff_text)
    file_tokens = num_tokens_from_string(current_content)
    # 只比较正文；行号和 XML 包装不参与「接近全文」的判断。
    # 例如 diff 9K、全文 10K，比例达到 0.8 -> 真实读取全文，减少模型合并 diff 的负担。
    if diff_tokens >= file_tokens * full_read_ratio:
        full_read = await _try_full_read(record, current_content, current_size, current_mtime_ms, max_tokens)
        if full_read is not None:
            return full_read
    if _is_diff_payload_safe(diff_lines, max_tokens):
        return FileChangeBlock(record.path, (
            f'<file path="{html.escape(record.path, quote=True)}">\n'
            f"  <diff>\n{html.escape(diff_text, quote=False)}\n  </diff>\n"
            f"{_build_size_tag(record.file_size_bytes, current_size)}\n"
            f"{_build_mtime_tag(record.file_mtime_ms, current_mtime_ms)}\n</file>"
        ), current_content)
    # 行数只是事实摘要；前两行是文件头，其余 +/- 行才计入增删，正文的 +++ 不能误排除。
    added = sum(line.startswith("+") for line in diff_lines[2:])
    removed = sum(line.startswith("-") for line in diff_lines[2:])
    return FileChangeBlock(record.path, (
        f'<file path="{html.escape(record.path, quote=True)}">\n'
        f"  <diff_summary>{added} lines added, {removed} lines removed</diff_summary>\n"
        f"{_build_size_tag(record.file_size_bytes, current_size)}\n"
        f"{_build_mtime_tag(record.file_mtime_ms, current_mtime_ms)}\n"
        "  <summary>Complete content exceeded the display budget. Read the relevant file or sections if this change affects the task.</summary>\n</file>"
    ))


async def detect_file_changes(
    state: HorizonState,
    current_hashes: dict[str, tuple[str, int]],
    current_mtimes: dict[str, float],
    *, budget: HorizonDisplayBudget, max_read_bytes: int,
) -> FileChanges:
    """在文件总预算内选择完整表达；外层原有 hash/mtime 并发采集保持不变。"""
    result = FileChanges()
    used = num_tokens_from_string("<file_changes>\n</file_changes>")
    reserve = num_tokens_from_string(_omission_notice(len(state.file_records)))
    # MEMORY.md 和 AGENTS.md 获得较大额度，并优先分配文件展示预算；其它文件保持原顺序。
    records = sorted(state.file_records.values(), key=lambda record: Path(record.path).name.casefold() not in {"memory.md", "agents.md"})
    for record in records:
        await asyncio.sleep(0)
        cur_hash, cur_size = current_hashes.get(record.path, ("", 0))
        if not cur_hash or cur_hash == record.file_hash:
            continue
        mtime = current_mtimes.get(record.path, 0.0)
        remaining = budget.file_changes_max_tokens - used - reserve
        if remaining <= 0:
            result.omitted += 1
            continue
        per_file = budget.important_file_change_max_tokens if Path(record.path).name.casefold() in {"memory.md", "agents.md"} else budget.file_change_max_tokens
        if cur_size > max_read_bytes:
            # 大文件沿用外层并发采集得到的 mtime；不能为了 Token 或摘要再扫全文。
            change = _notice(record, cur_size, mtime, "Large-file metadata changed; no new file content has been supplied")
        else:
            change = await _build_file_diff_block(
                record, cur_size, mtime,
                max_tokens=min(per_file, remaining), full_read_ratio=budget.full_read_ratio,
            )
        if change is None:
            continue
        cost = num_tokens_from_string(change.content)
        if cost > remaining:
            change = _notice(record, cur_size, mtime, "The file changed; its complete result exceeds the remaining file display budget")
            cost = num_tokens_from_string(change.content)
        if cost > remaining:
            result.omitted += 1
            continue
        result.changes.append(change)
        # 估算器有整体取整，不能把每块独立取整的误差累积成额外额度。
        used = num_tokens_from_string("\n".join(["<file_changes>", *(item.content for item in result.changes), "</file_changes>"]))
    return result
