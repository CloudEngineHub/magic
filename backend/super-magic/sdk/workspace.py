"""
Super Magic SDK workspace path helpers.

Skill scripts run from different working directories. This module is the
single place for resolving project and workspace paths from the runtime
environment.
"""

from __future__ import annotations

import os
from os import PathLike
from pathlib import Path
from typing import Final


PROJECT_ROOT_ENV: Final[str] = "SUPER_MAGIC_PROJECT_ROOT"
WORKSPACE_DIR_NAME: Final[str] = ".workspace"


def get_project_root() -> Path:
    """Return the absolute Super Magic project root from SUPER_MAGIC_PROJECT_ROOT."""

    value = os.environ.get(PROJECT_ROOT_ENV)
    if not value:
        raise RuntimeError(f"缺少 {PROJECT_ROOT_ENV}，无法定位 Super Magic 项目根目录。")

    path = Path(value).expanduser()
    if not path.is_absolute():
        raise RuntimeError(f"{PROJECT_ROOT_ENV} 必须是绝对路径，当前值: {value}")
    return path.resolve()


def resolve_project_path(path: str | PathLike[str] | Path) -> Path:
    """Resolve a path to an absolute path under the Super Magic project root.

    Absolute paths are normalized and returned as-is. Relative paths are
    resolved against SUPER_MAGIC_PROJECT_ROOT, never against the process cwd.
    """

    path_obj = Path(path).expanduser()
    if path_obj.is_absolute():
        return path_obj.resolve()
    return (get_project_root() / path_obj).resolve()


def resolve_workspace_file_path(path: str | PathLike[str] | Path) -> Path:
    """Resolve a user-visible workspace file path to an absolute path.

    Absolute paths are normalized and returned as-is. Relative paths are treated
    as paths inside ``SUPER_MAGIC_PROJECT_ROOT/.workspace``. This helper is for
    CLI arguments that point to user-uploaded or workbench-managed materials,
    not for project source files.
    """

    path_obj = Path(path).expanduser()
    if path_obj.is_absolute():
        return path_obj.resolve()
    if any(part == ".." for part in path_obj.parts):
        raise ValueError("用户材料路径不能包含 '..'，请使用 workspace 相对路径或绝对路径。")
    if path_obj.parts and path_obj.parts[0] == WORKSPACE_DIR_NAME:
        return resolve_project_path(path_obj)
    return get_workspace_path(path_obj).resolve()


def get_workspace_relative_path(path: str | PathLike[str] | Path) -> str:
    """Return a workspace-root-relative path for frontend-visible files."""

    path_obj = Path(path).expanduser()
    if path_obj.is_absolute():
        try:
            return path_obj.resolve().relative_to(get_workspace_root()).as_posix()
        except ValueError:
            return path_obj.resolve().as_posix()
    if path_obj.parts and path_obj.parts[0] == WORKSPACE_DIR_NAME:
        return Path(*path_obj.parts[1:]).as_posix()
    return path_obj.as_posix().lstrip("/")


def get_workspace_root(workspace: str | PathLike[str] | Path | None = None) -> Path:
    """Return the absolute user-visible workspace root.

    If ``workspace`` is provided, it may be absolute or project-relative. If it
    is omitted, the default is ``SUPER_MAGIC_PROJECT_ROOT/.workspace``.
    """

    if workspace:
        return resolve_project_path(workspace)
    return get_project_root() / WORKSPACE_DIR_NAME


def get_workspace_path(*parts: str | PathLike[str] | Path, workspace: str | PathLike[str] | Path | None = None) -> Path:
    """Return an absolute path under the workspace root."""

    base = get_workspace_root(workspace)
    for part in parts:
        base = base / Path(part)
    return base
