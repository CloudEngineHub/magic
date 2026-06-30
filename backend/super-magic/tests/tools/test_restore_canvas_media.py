from pathlib import Path

import pytest

from app.core.entity.message.server_message import DisplayType
from app.tools.design.tools.restore_canvas_media import (
    RestoreCanvasMedia,
    RestoreCanvasMediaParams,
)
from app.tools.design.utils.magic_project_design_parser import (
    CanvasConfig,
    ImageElement,
    MagicProjectConfig,
    flatten_all_elements,
    read_magic_project_js,
    write_magic_project_js_v2,
)


def _save_mock_image(path: Path, size: tuple[int, int] = (320, 180)) -> None:
    """保存用于单测的 mock 图片。"""
    from PIL import Image

    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", size, color="blue").save(path)


async def _write_design_project(project_dir: Path, elements=None) -> None:
    """写入用于单测的空设计项目配置。"""
    await write_magic_project_js_v2(
        str(project_dir),
        MagicProjectConfig(
            version="2.0.0",
            type="design",
            name=project_dir.name,
            canvas=CanvasConfig(elements=elements or []),
        ),
    )


@pytest.mark.asyncio
async def test_restore_canvas_media_adds_missing_images_and_videos(tmp_path):
    """恢复工具会把 images/videos 中缺失的媒体注册为画布元素。"""
    project_dir = tmp_path / "demo"
    (project_dir / "images").mkdir(parents=True)
    (project_dir / "videos").mkdir(parents=True)
    _save_mock_image(project_dir / "images" / "cover.png", size=(400, 200))
    _save_mock_image(project_dir / "videos" / "clip.png", size=(640, 360))
    (project_dir / "videos" / "clip.mp4").write_bytes(b"mock-video")
    await _write_design_project(project_dir)

    tool = RestoreCanvasMedia(base_dir=str(tmp_path))
    result = await tool.execute(
        None,
        RestoreCanvasMediaParams(project_path="demo", dry_run=False),
    )

    assert result.ok
    assert result.data["restored_count"] == 2

    config = await read_magic_project_js(str(project_dir))
    elements = flatten_all_elements(config)
    sources = {getattr(element, "src", None) for element in elements}

    assert "./images/cover.png" in sources
    assert "./videos/clip.mp4" in sources
    video = next(element for element in elements if getattr(element, "src", None) == "./videos/clip.mp4")
    assert getattr(video, "poster", None) == "./videos/clip.png"
    assert video.width == 640
    assert video.height == 360

    tool_detail = await tool.get_tool_detail(None, result, {"project_path": "demo", "dry_run": False})
    assert tool_detail is not None
    assert tool_detail.type == DisplayType.MD
    assert tool_detail.data.file_name == "restore_canvas_media.md"
    assert "画布媒体恢复结果" in tool_detail.data.content
    assert "./images/cover.png" in tool_detail.data.content
    assert "./videos/clip.mp4" in tool_detail.data.content


@pytest.mark.asyncio
async def test_restore_canvas_media_skips_existing_sources(tmp_path):
    """恢复工具不会重复注册已存在的媒体 src。"""
    project_dir = tmp_path / "demo"
    _save_mock_image(project_dir / "images" / "cover.png")
    existing = ImageElement(
        id="image-existing",
        type="image",
        name="已有图片",
        src="images/cover.png",
        x=0,
        y=0,
        width=320,
        height=180,
        zIndex=1,
        visible=True,
        status="completed",
    )
    await _write_design_project(project_dir, elements=[existing])

    tool = RestoreCanvasMedia(base_dir=str(tmp_path))
    result = await tool.execute(
        None,
        RestoreCanvasMediaParams(project_path="demo"),
    )

    assert result.ok
    assert result.data["restored_count"] == 0

    config = await read_magic_project_js(str(project_dir))
    elements = flatten_all_elements(config)
    assert len(elements) == 1
    assert elements[0].id == "image-existing"


@pytest.mark.asyncio
async def test_restore_canvas_media_defaults_to_dry_run_and_does_not_write(tmp_path):
    """默认 dry_run 只返回缺失媒体，不修改 magic.project.js。"""
    project_dir = tmp_path / "demo"
    _save_mock_image(project_dir / "images" / "cover.png")
    await _write_design_project(project_dir)

    tool = RestoreCanvasMedia(base_dir=str(tmp_path))
    result = await tool.execute(
        None,
        RestoreCanvasMediaParams(project_path="demo"),
    )

    assert result.ok
    assert result.data["missing_count"] == 1
    assert result.data["restored_count"] == 0
    before = await tool.get_before_tool_call_friendly_action_and_remark(
        "restore_canvas_media",
        None,
        {"project_path": "demo"},
    )
    after = await tool.get_after_tool_call_friendly_action_and_remark(
        "restore_canvas_media",
        None,
        result,
        0,
        {"project_path": "demo"},
    )
    assert before == {"action": "扫描可恢复媒体", "remark": "demo"}
    assert after == {"action": "扫描可恢复媒体", "remark": "发现 1 个可恢复媒体，等待确认"}

    config = await read_magic_project_js(str(project_dir))
    assert flatten_all_elements(config) == []
    tool_detail = await tool.get_tool_detail(None, result, {"project_path": "demo"})
    assert tool_detail is not None
    assert tool_detail.type == DisplayType.MD
    assert "可恢复画布媒体预览" in tool_detail.data.content
    assert "确认前不会写入 magic.project.js" in tool_detail.data.content
    assert "./images/cover.png" in tool_detail.data.content
