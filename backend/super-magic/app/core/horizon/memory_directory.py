"""当前项目记忆目录的成员观察；展示折叠不改变磁盘，也不表示读过笔记。"""
from __future__ import annotations

import asyncio
import html
import posixpath
import re
from collections import Counter
from datetime import date
from pathlib import Path
from typing import TYPE_CHECKING

from agentlang.config.config import config
from agentlang.logger import get_logger
from agentlang.utils.token_estimator import num_tokens_from_string
from app.core.horizon.models import MemoryDirectoryDisplayPolicy, MemoryDirectorySnapshot
from app.utils.async_file_utils import async_exists, async_scandir

if TYPE_CHECKING:
    from app.core.context.agent_context import AgentContext

logger = get_logger(__name__)


def _positive_setting(name: str) -> int:
    key = f"memory.file_tree_change_context.{name}"
    value = config.get(key)
    if isinstance(value, bool) or not str(value).isdigit() or int(value) <= 0:
        raise ValueError(f"{key} must be a positive integer")
    return int(value)


def _configured_paths(key: str) -> tuple[str, ...]:
    raw = config.get(f"memory.file_tree_change_context.{key}", [])
    if not isinstance(raw, list):
        logger.warning(f"记忆文件树展示配置应为路径列表，忽略该偏好: {key}")
        return ()
    paths: list[str] = []
    for item in raw:
        if not isinstance(item, str) or not item.strip():
            logger.warning(f"记忆文件树展示配置包含无效路径项，已跳过: {key}")
            continue
        path = posixpath.normpath(item.strip())
        if path.startswith("/") or path == ".." or path.startswith("../"):
            logger.warning(f"记忆文件树展示路径必须位于当前根内，已跳过: {key}")
            continue
        if path not in paths:
            paths.append(path)
    return tuple(paths)


def _display_policy() -> MemoryDirectoryDisplayPolicy:
    return MemoryDirectoryDisplayPolicy(_configured_paths("preferred_paths"), _configured_paths("timeline_paths"))


def _timeline_root(path: str, policy: MemoryDirectoryDisplayPolicy) -> str | None:
    return next((root for root in sorted(policy.timeline_paths, key=len, reverse=True)
                 if path == root or path.startswith(root + "/") or root == "."), None)


def _calendar_date(path: str, policy: MemoryDirectoryDisplayPolicy) -> date | None:
    root = _timeline_root(path, policy)
    if root is None or path == root:
        return None
    relative = path if root == "." else path[len(root) + 1:]
    parts = relative.split("/")
    if not re.fullmatch(r"\d{4}", parts[0]):
        return None
    try:
        year = int(parts[0])
        if len(parts) == 1:
            return date(year, 1, 1)
        if not re.fullmatch(r"\d{2}", parts[1]):
            return None
        month = int(parts[1])
        if len(parts) == 2:
            return date(year, month, 1)
        match = re.fullmatch(r"(\d{4}-\d{2}-\d{2})(?:\.md)?", parts[2])
        if match is None:
            return None
        day = date.fromisoformat(match.group(1))
        return day if day.year == year and day.month == month else None
    except ValueError:
        return None


def _priority(path: str, today: date, policy: MemoryDirectoryDisplayPolicy) -> tuple[int, int, str]:
    if path == "." or any(path == preferred or preferred.startswith(path + "/") for preferred in policy.preferred_paths):
        return 0, len(Path(path).parts), path
    calendar_date = _calendar_date(path, policy)
    if calendar_date is not None:
        if calendar_date <= today:
            return (2, -calendar_date.toordinal(), path)
        return (3, len(Path(path).parts), path)
    return 1, len(Path(path).parts), path


async def scan_memory_directory(
    root: Path, agent_context: "AgentContext",
) -> MemoryDirectorySnapshot | None:
    """获取允许深度内的完整目录条目；失败时不返回半份快照。"""
    try:
        scan_depth = _positive_setting("scan_depth")
        root = root.absolute()
        snapshot = MemoryDirectorySnapshot(root=str(root), scan_depth=scan_depth)
        if not await async_exists(root):
            snapshot.exists = False
            return snapshot

        async def scan(directory: Path, depth: int) -> None:
            if agent_context.is_interruption_requested():
                raise asyncio.CancelledError()
            agent_context.update_activity_time()
            for entry in await async_scandir(directory):
                path = Path(entry.path)
                kind = "link" if entry.is_symlink() else "directory" if entry.is_dir(follow_symlinks=False) else "file"
                snapshot.entries[path.relative_to(root).as_posix()] = kind
                if kind == "directory" and depth < scan_depth:
                    await scan(path, depth + 1)

        # notes/timeline/YYYY/MM/YYYY-MM-DD.md 在第 5 层，日内事件详情在第 6 层。
        # 扫描深度可配置；展示折叠不改变条目，也不再为分组数量继续遍历深层后代。
        await scan(root, 1)
        return snapshot
    except Exception as error:
        logger.warning(f"记忆目录扫描失败，保留上次成功结果: {root}: {error}")
        return None


def _fold_history_path(path: str, today: date, policy: MemoryDirectoryDisplayPolicy) -> str:
    """只折叠展示路径：往年按年、当前年的旧月按月，近期和未知布局保留原路径。"""
    day = _calendar_date(path, policy)
    root = _timeline_root(path, policy)
    if day is None or root is None:
        return path
    if day.year < today.year:
        return posixpath.normpath(f"{root}/{day.year:04d}")
    if (day.year, day.month) < (today.year, today.month):
        relative = path if root == "." else path[len(root) + 1:]
        if len(relative.split("/")) >= 2:
            return posixpath.normpath(f"{root}/{day.year:04d}/{day.month:02d}")
    return path


def _entry_lines(
    entries: dict[str, str], label: str, today: date, policy: MemoryDirectoryDisplayPolicy,
) -> dict[str, str]:
    counts = Counter(_fold_history_path(path, today, policy) for path in entries)
    lines: dict[str, str] = {}
    for path, count in counts.items():
        if count == 1 and path in entries:
            lines[path] = f"{label}: {path} ({entries[path]})"
        else:
            lines[path] = f"{label}: {path}/ ({count} scanned entries)"
    return lines


def render_memory_directory(
    current: MemoryDirectorySnapshot, previous: MemoryDirectorySnapshot | None, today: date,
) -> str:
    """比较扫描条目并按 Token 折叠展示，不记录模型看过哪些成员名称。"""
    if current == previous:
        return ""
    policy = _display_policy()
    same_scope = previous is not None and previous.root == current.root and previous.scan_depth == current.scan_depth
    if same_scope:
        added = {path: kind for path, kind in current.entries.items() if previous.entries.get(path) != kind}
        removed = {path: kind for path, kind in previous.entries.items() if current.entries.get(path) != kind}
        entries = _entry_lines(added, "Added", today, policy)
        for path, line in _entry_lines(removed, "Removed", today, policy).items():
            entries[path] = f"{entries[path]}; {line}" if path in entries else line
    else:
        entries = _entry_lines(current.entries, "Available", today, policy)

    status = "current" if current.exists else "missing"
    lines = [
        f'<memory_directory root="{html.escape(current.root, quote=True)}" status="{status}">',
        f"Scanned {len(current.entries)} entries through depth {current.scan_depth}. Note contents have not been read.",
        "Use relevant paths directly; use list_dir or file search for deeper or folded entries.",
    ]
    if previous is not None and previous.root == current.root and previous.scan_depth != current.scan_depth:
        lines.append("Scan depth changed; this refreshed coverage is not a deletion notice.")
    if not current.exists:
        lines.append("The memory directory does not exist.")
    details = [html.escape(entries[path]) for path in sorted(entries, key=lambda p: _priority(p, today, policy))]
    tail = "</memory_directory>"
    max_tokens = _positive_setting("max_tokens")
    content = "\n".join([*lines, *details, tail])
    if num_tokens_from_string(content) <= max_tokens:
        return content

    reserve = f"{len(details)} additional paths or groups are folded; inspect them only when relevant."
    omitted = 0
    for detail in details:
        if num_tokens_from_string("\n".join([*lines, detail, reserve, tail])) <= max_tokens:
            lines.append(detail)
        else:
            omitted += 1
    if omitted:
        lines.append(f"{omitted} additional paths or groups are folded; inspect them only when relevant.")
    content = "\n".join([*lines, tail])
    return content if num_tokens_from_string(content) <= max_tokens else ""
