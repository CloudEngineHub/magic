"""Sandbox 本地运行文件的目录与机会式淘汰工具。

Sandbox 重建会清空 `.runtime`，但 Claw 等运行形态可能长期不重建 sandbox，
因此各 owner 仍需通过即时删除或机会式淘汰限制运行文件持续积累。
"""

import asyncio
import os
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path

from agentlang.logger import get_logger
from app.path_manager import PathManager
from app.utils.async_file_utils import (
    async_chmod,
    async_exists,
    async_is_symlink,
    async_mkdir,
    async_scandir,
    async_stat,
    async_unlink,
)

logger = get_logger(__name__)

_cleanup_tasks: dict[str, asyncio.Task[None]] = {}


@dataclass(frozen=True, slots=True)
class RuntimeEvictionPolicy:
    """单层 runtime 文件目录的容量高低水位和宽松最长存活时间。"""

    max_entries: int | None = None
    target_entries: int | None = None
    max_total_bytes: int | None = None
    target_total_bytes: int | None = None
    max_age_seconds: int | None = None

    def __post_init__(self) -> None:
        self._validate_pair("entries", self.max_entries, self.target_entries)
        self._validate_pair("total bytes", self.max_total_bytes, self.target_total_bytes)
        if self.max_age_seconds is not None and self.max_age_seconds <= 0:
            raise ValueError("max_age_seconds must be greater than zero.")

    @staticmethod
    def _validate_pair(name: str, maximum: int | None, target: int | None) -> None:
        if (maximum is None) != (target is None):
            raise ValueError(f"{name} maximum and target must be configured together.")
        if maximum is None or target is None:
            return
        if maximum <= 0 or target < 0 or target > maximum:
            raise ValueError(f"Invalid {name} watermarks: maximum={maximum}, target={target}.")


@dataclass(frozen=True, slots=True)
class _RuntimeFile:
    path: Path
    size: int
    modified_at: float


def _absolute_path(path: Path) -> Path:
    """仅做词法绝对化，不解析或跟随文件系统中的软链接。"""
    return Path(os.path.abspath(path))


def _assert_runtime_path(path: Path) -> tuple[Path, Path]:
    runtime_root = _absolute_path(PathManager.get_runtime_dir())
    target = _absolute_path(path)
    if target != runtime_root and runtime_root not in target.parents:
        raise ValueError(f"Runtime path must stay inside {runtime_root}: {target}")
    return runtime_root, target


async def ensure_runtime_directory(directory: Path) -> Path:
    """创建 `.runtime` 内的私有目录，并拒绝路径链上的软链接。"""
    runtime_root, target = _assert_runtime_path(directory)
    relative_parts = target.relative_to(runtime_root).parts

    current = runtime_root
    for part in (None, *relative_parts):
        if part is not None:
            current = current / part
        if await async_is_symlink(current):
            raise ValueError(f"Runtime directory must not be a symbolic link: {current}")
        await async_mkdir(current, parents=True, exist_ok=True)
        await async_chmod(current, 0o700)

    return target


def trigger_opportunistic_cleanup(
    cleanup_key: str,
    cleanup_factory: Callable[[], Awaitable[None]],
) -> None:
    """按 key 启动不阻塞当前业务的 single-flight 清理任务。"""
    running_task = _cleanup_tasks.get(cleanup_key)
    if running_task is not None and not running_task.done():
        return

    task = asyncio.create_task(cleanup_factory(), name=f"runtime-cleanup:{cleanup_key}")
    _cleanup_tasks[cleanup_key] = task

    def _finish(completed: asyncio.Task[None]) -> None:
        if _cleanup_tasks.get(cleanup_key) is completed:
            _cleanup_tasks.pop(cleanup_key, None)
        try:
            completed.result()
        except asyncio.CancelledError:
            return
        except Exception as error:
            logger.warning("Runtime cleanup failed: key=%s, error=%s", cleanup_key, error)

    task.add_done_callback(_finish)


async def evict_runtime_files(
    directory: Path,
    *,
    policy: RuntimeEvictionPolicy,
    suffixes: tuple[str, ...],
    protected_paths: frozenset[Path] = frozenset(),
) -> None:
    """按 mtime 淘汰 `.runtime` 单层目录中的普通文件。"""
    _, target = _assert_runtime_path(directory)
    if not await async_exists(target):
        return
    if await async_is_symlink(target):
        raise ValueError(f"Runtime directory must not be a symbolic link: {target}")

    protected = {_absolute_path(path) for path in protected_paths}
    files: list[_RuntimeFile] = []
    for entry in await async_scandir(target):
        path = _absolute_path(Path(entry.path))
        if path in protected or entry.is_symlink() or not entry.is_file(follow_symlinks=False):
            continue
        if suffixes and path.suffix not in suffixes:
            continue
        try:
            stat = await async_stat(path)
        except FileNotFoundError:
            continue
        files.append(_RuntimeFile(path=path, size=stat.st_size, modified_at=stat.st_mtime))

    files.sort(key=lambda item: item.modified_at)
    now = time.time()

    if policy.max_age_seconds is not None:
        cutoff = now - policy.max_age_seconds
        expired = [item for item in files if item.modified_at < cutoff]
        await _delete_runtime_files(expired)
        expired_paths = {item.path for item in expired}
        files = [item for item in files if item.path not in expired_paths]

    total_bytes = sum(item.size for item in files)
    over_entries = policy.max_entries is not None and len(files) > policy.max_entries
    over_bytes = policy.max_total_bytes is not None and total_bytes > policy.max_total_bytes
    if not over_entries and not over_bytes:
        return

    remaining_entries = len(files)
    for item in files:
        entries_ok = policy.target_entries is None or remaining_entries <= policy.target_entries
        bytes_ok = policy.target_total_bytes is None or total_bytes <= policy.target_total_bytes
        if entries_ok and bytes_ok:
            break
        await async_unlink(item.path)
        remaining_entries -= 1
        total_bytes -= item.size


async def _delete_runtime_files(files: list[_RuntimeFile]) -> None:
    for item in files:
        await async_unlink(item.path)
