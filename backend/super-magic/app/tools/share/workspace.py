"""工作区路径、文件存在性和 MagicFS 文件 ID 解析。"""

from __future__ import annotations

import os
import re
from collections.abc import Sequence
from pathlib import Path

from agentlang.context.tool_context import ToolContext
from app.core.context.agent_context import AgentContext
from app.path_manager import PathManager
from app.utils.async_file_utils import (
    async_exists,
    async_is_file,
    async_is_symlink,
    get_file_id_from_xattr,
    get_s3_key_from_xattr,
)

from .models import ResolvedShareFile, ShareErrorInfo, ShareServiceError, normalize_resource_id

_PROJECT_ID_IN_STORAGE_KEY = re.compile(r"(?:^|/)project_(\d+)(?:/|$)")


async def resolve_workspace_files(
    workspace_root: Path,
    file_paths: Sequence[str],
) -> tuple[ResolvedShareFile, ...]:
    """解析并去重一组工作区文件。"""
    if not file_paths:
        raise ShareServiceError(
            ShareErrorInfo(code="file_paths_required", message="file_paths must contain at least one workspace file.")
        )

    resolved: list[ResolvedShareFile] = []
    seen_file_ids: set[str] = set()
    for file_path in file_paths:
        item = await resolve_workspace_file(workspace_root, file_path)
        if item.file_id not in seen_file_ids:
            resolved.append(item)
            seen_file_ids.add(item.file_id)
    return tuple(resolved)


async def resolve_workspace_file(
    workspace_root: Path,
    file_path: str,
    *,
    expected_project_id: str | None = None,
) -> ResolvedShareFile:
    """解析单个工作区文件并读取其 MagicFS 文件 ID。"""
    normalized = normalize_workspace_path(workspace_root, file_path)
    await _reject_symlink_path(workspace_root, normalized, file_path)
    if not await async_exists(normalized):
        raise ShareServiceError(
            ShareErrorInfo(code="file_not_found", message=f"Workspace file not found: {file_path}", path=file_path)
        )
    if not await async_is_file(normalized):
        raise ShareServiceError(
            ShareErrorInfo(code="not_a_file", message=f"The share path is not a file: {file_path}", path=file_path)
        )

    file_id = (await get_file_id_from_xattr(normalized) or "").strip()
    if not file_id:
        raise ShareServiceError(
            ShareErrorInfo(
                code="file_id_missing",
                message=f"The file is not synchronized with MagicFS and has no file ID: {file_path}",
                path=file_path,
            )
        )
    normalize_resource_id(file_id, "invalid_file_id")
    if expected_project_id is not None:
        await _validate_project_membership(normalized, file_path, expected_project_id)
    return ResolvedShareFile(
        requested_path=file_path,
        relative_path=normalized.relative_to(workspace_root).as_posix(),
        absolute_path=normalized,
        file_id=file_id,
    )


def find_entry_file(
    workspace_root: Path,
    entry_file_path: str,
    files: Sequence[ResolvedShareFile],
) -> ResolvedShareFile:
    """确认入口文件属于待分享文件集合。"""
    normalized_entry = normalize_workspace_path(workspace_root, entry_file_path)
    for item in files:
        if item.absolute_path == normalized_entry:
            return item
    raise ShareServiceError(
        ShareErrorInfo(
            code="entry_file_not_shared",
            message="entry_file_path must identify one of the files in file_paths.",
            path=entry_file_path,
        )
    )


def normalize_workspace_path(workspace_root: Path, file_path: str) -> Path:
    """做词法规范化并阻止路径逃出当前工作区。"""
    raw_path = file_path.strip()
    if not raw_path:
        raise ShareServiceError(
            ShareErrorInfo(code="file_path_required", message="A non-empty workspace file path is required.")
        )

    candidate = Path(raw_path)
    combined = candidate if candidate.is_absolute() else workspace_root / candidate
    normalized = Path(os.path.abspath(os.path.normpath(str(combined))))
    try:
        normalized.relative_to(workspace_root)
    except ValueError as exc:
        raise ShareServiceError(
            ShareErrorInfo(
                code="path_outside_workspace",
                message=f"Share paths must stay inside the current workspace: {file_path}",
                path=file_path,
            )
        ) from exc
    return normalized


async def _reject_symlink_path(workspace_root: Path, normalized: Path, requested_path: str) -> None:
    """拒绝任一路径段为软链，防止词法 containment 被真实目标绕过。"""
    relative = normalized.relative_to(workspace_root)
    current = workspace_root
    for part in relative.parts:
        current /= part
        if await async_is_symlink(current):
            raise ShareServiceError(
                ShareErrorInfo(
                    code="path_symlink_not_allowed",
                    message="Share paths must not use symbolic links. Use the target file's workspace path instead.",
                    path=requested_path,
                )
            )


async def _validate_project_membership(file_path: Path, requested_path: str, expected_project_id: str) -> None:
    """利用 MagicFS 真实存储键校验项目首页属于当前项目。"""
    storage_key = (await get_s3_key_from_xattr(file_path) or "").strip().replace("\\", "/")
    if not storage_key:
        raise ShareServiceError(
            ShareErrorInfo(
                code="file_project_unverified",
                message="entry_file_path must have a project-qualified MagicFS storage key.",
                path=requested_path,
            )
        )

    match = _PROJECT_ID_IN_STORAGE_KEY.search(storage_key)
    if match is None:
        raise ShareServiceError(
            ShareErrorInfo(
                code="file_project_unverified",
                message="The project of entry_file_path could not be verified from its MagicFS storage key.",
                path=requested_path,
            )
        )
    if match.group(1) == expected_project_id:
        return

    raise ShareServiceError(
        ShareErrorInfo(
            code="file_not_in_project",
            message="entry_file_path must belong to the current project.",
            path=requested_path,
        )
    )


def get_workspace_root(tool_context: ToolContext) -> Path:
    """从工具上下文取得当前工作区根目录。"""
    raw_workspace = str(tool_context.get_metadata("workspace_dir") or "").strip()
    if not raw_workspace:
        agent_context = tool_context.get_extension_typed("agent_context", AgentContext)
        if agent_context is not None:
            raw_workspace = str(agent_context.get_workspace_dir() or "").strip()
    if not raw_workspace:
        raw_workspace = str(PathManager.get_workspace_dir())
    return Path(os.path.abspath(os.path.normpath(raw_workspace)))


__all__ = [
    "find_entry_file",
    "get_workspace_root",
    "normalize_workspace_path",
    "resolve_workspace_file",
    "resolve_workspace_files",
]
