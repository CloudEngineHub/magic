"""Canvas 工作区目录准备的 mock 测试。"""

from __future__ import annotations

from pathlib import Path

import pytest

import tests.tools.canvas.helpers  # noqa: F401
from app.tools.canvas.domain.errors import CanvasDomainError
from app.tools.canvas.infrastructure.workspace import CanvasWorkspaceDirectoryManager
from app.tools.canvas.repository import CanvasRepository


@pytest.mark.asyncio
async def test_initialize_creates_required_media_directories(tmp_path: Path) -> None:
    """初始化项目时应创建 images 和 videos 目录。"""
    repository = CanvasRepository(tmp_path)

    await repository.initialize("mock-project")

    assert (tmp_path / "mock-project" / "images").is_dir()
    assert (tmp_path / "mock-project" / "videos").is_dir()


@pytest.mark.asyncio
async def test_read_repairs_missing_media_directories(tmp_path: Path) -> None:
    """读取旧项目时应补齐缺失的媒体目录。"""
    repository = CanvasRepository(tmp_path)
    await repository.initialize("mock-project")
    (tmp_path / "mock-project" / "images").rmdir()
    (tmp_path / "mock-project" / "videos").rmdir()

    await repository.read("mock-project")

    assert (tmp_path / "mock-project" / "images").is_dir()
    assert (tmp_path / "mock-project" / "videos").is_dir()


@pytest.mark.asyncio
async def test_media_file_collision_is_rejected(tmp_path: Path) -> None:
    """媒体目录同名路径是普通文件时应拒绝继续写入。"""
    repository = CanvasRepository(tmp_path)
    await repository.initialize("mock-project")
    (tmp_path / "mock-project" / "videos").rmdir()
    (tmp_path / "mock-project" / "videos").write_text("mock", encoding="utf-8")

    with pytest.raises(CanvasDomainError) as error:
        await repository.read("mock-project")

    assert error.value.code == "CANVAS_MEDIA_DIRECTORY_INVALID"


def test_project_directory_parts_are_workspace_relative() -> None:
    """远端目录路径应保留嵌套项目层级并追加媒体目录。"""
    assert CanvasWorkspaceDirectoryManager.project_directory_parts(
        "group/mock-project",
        "videos",
    ) == ["group", "mock-project", "videos"]
