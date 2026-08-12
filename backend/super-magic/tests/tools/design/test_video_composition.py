"""基础 MP4 合成服务、适配器命令和工具写回测试。"""

from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from agentlang.path_manager import PathManager
from app.tools.design.codec.v3_codec import MAGIC_PROJECT_VERSION_V3
from app.tools.design.domain.canvas_document import (
    CanvasConnection,
    CanvasDocumentV3,
    CanvasElementV3,
    MagicProjectConfigV3,
)
from app.tools.design.domain.content import ElementContent
from app.tools.design.manager.canvas_manager_v3 import write_magic_project_js_v3
from app.tools.design.tools.compose_canvas_video import (
    ComposeCanvasVideo,
    ComposeCanvasVideoParams,
)
from app.tools.design.video_production.adapters.ffmpeg_video_composition_adapter import (
    FfmpegVideoCompositionAdapter,
    VideoCompositionError,
    _SourceMediaInfo,
)
from app.tools.design.video_production.ports.video_composition_port import (
    VideoCompositionRequest,
    VideoCompositionResult,
)
from app.tools.design.video_production.service.composition_service import (
    VideoCompositionService,
)
from app.utils.async_file_utils import async_mkdir, async_write_bytes


def _element(
    element_id: str,
    element_type: str,
    *,
    name: str,
    fields: dict,
) -> CanvasElementV3:
    """构造带单个 main Content 的模拟媒体 Element。"""
    content_id = f"{element_id}-content-1"
    return CanvasElementV3(
        id=element_id,
        type=element_type,
        properties={
            "name": name,
            "x": 0,
            "y": 0,
            "width": 320,
            "height": 180,
            "zIndex": 1,
        },
        contents=[ElementContent(content_id=content_id, fields=fields)],
        active_content_id=content_id,
        main_content_id=content_id,
    )


def _composition_config() -> MagicProjectConfigV3:
    """构造包含有序视频、音频和 Video Edit 的模拟 V3 文档。"""
    video_edit = _element(
        "video-edit-1",
        "video-edit",
        name="模拟成片配置",
        fields={
            "videoSequence": ["video-2", "video-1"],
            "audioSequence": ["audio-1"],
            "output": {"aspectRatio": "9:16", "resolution": "720P", "format": "mp4"},
        },
    )
    return MagicProjectConfigV3(
        version=MAGIC_PROJECT_VERSION_V3,
        type="design",
        name="合成模拟项目",
        canvas=CanvasDocumentV3(
            elements=[
                _element(
                    "video-1",
                    "video",
                    name="模拟镜头一",
                    fields={"src": "./videos/one.mp4", "status": "completed"},
                ),
                _element(
                    "video-2",
                    "video",
                    name="模拟镜头二",
                    fields={"src": "./videos/two.mp4", "status": "completed"},
                ),
                _element(
                    "audio-1",
                    "audio",
                    name="模拟旁白",
                    fields={"src": "./audio/narration.mp3"},
                ),
                video_edit,
            ],
            connections=[
                CanvasConnection(
                    id="connection-video-1",
                    source_element_id="video-1",
                    target_element_id="video-edit-1",
                    locked=True,
                ),
                CanvasConnection(
                    id="connection-video-2",
                    source_element_id="video-2",
                    target_element_id="video-edit-1",
                    locked=True,
                ),
                CanvasConnection(
                    id="connection-audio-1",
                    source_element_id="audio-1",
                    target_element_id="video-edit-1",
                    locked=True,
                ),
            ],
        ),
    )


@pytest.fixture
def workspace(monkeypatch, tmp_path: Path) -> Path:
    """把画布和模拟媒体切换到隔离临时目录。"""
    monkeypatch.setattr(PathManager, "get_workspace_dir", lambda: tmp_path)
    return tmp_path


def test_composition_service_uses_sequences_and_writes_result_lifecycle():
    """合成服务按数组顺序解析输入，并维护结果 Content 与锁定连接。"""
    config = _composition_config()
    service = VideoCompositionService()

    input_spec = service.inspect_inputs(config.canvas, "video-edit-1")
    preparation = service.prepare_result(
        config.canvas,
        video_edit_element_id="video-edit-1",
        result_name="模拟最终视频",
        result_element_id=None,
        relative_output_path="./videos/final.mp4",
    )
    service.mark_completed(config.canvas, preparation)

    assert input_spec.video_element_ids == ["video-2", "video-1"]
    assert input_spec.video_sources == ["./videos/two.mp4", "./videos/one.mp4"]
    assert (input_spec.output_width, input_spec.output_height) == (720, 1280)
    result_element = config.canvas.get_element(preparation.result_element_id)
    result_content = result_element.get_content(preparation.result_content_id)
    assert result_content.fields["status"] == "completed"
    assert result_content.fields["src"] == "./videos/final.mp4"
    assert result_element.properties["x"] == 880.0
    assert result_element.properties["y"] == 0.0
    assert result_element.properties["zIndex"] == 2
    assert (config.canvas.get_element("video-edit-1").x, config.canvas.get_element("video-edit-1").y) == (
        0.0,
        0.0,
    )
    assert any(
        connection.source_element_id == "video-edit-1"
        and connection.target_element_id == result_element.id
        and connection.locked
        for connection in config.canvas.connections
    )


def test_composition_service_rejects_sequence_without_connection():
    """序列成员没有明确输入 Connection 时拒绝启动合成。"""
    config = _composition_config()
    config.canvas.connections = [
        connection
        for connection in config.canvas.connections
        if connection.source_element_id != "video-2"
    ]

    with pytest.raises(ValueError, match="video-2 -> video-edit-1"):
        VideoCompositionService().inspect_inputs(config.canvas, "video-edit-1")


def test_ffmpeg_adapter_builds_fixed_concat_and_single_audio_command(tmp_path: Path):
    """FFmpeg 命令只包含顺序拼接、补边和单一最终音轨。"""
    adapter = FfmpegVideoCompositionAdapter()
    command = adapter._build_command(
        VideoCompositionRequest(
            video_paths=[tmp_path / "two.mp4", tmp_path / "one.mp4"],
            audio_path=tmp_path / "narration.mp3",
            output_path=tmp_path / "final.mp4",
            width=1280,
            height=720,
        ),
        tmp_path / "temporary.mp4",
    )
    filter_complex = command[command.index("-filter_complex") + 1]

    assert command[:6] == ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i"]
    assert str(tmp_path / "two.mp4") in command
    assert str(tmp_path / "one.mp4") in command
    assert "scale=1280:720:force_original_aspect_ratio=decrease" in filter_complex
    assert "concat=n=2:v=1:a=0[vout]" in filter_complex
    assert "-shortest" in command
    assert "-c:a" in command
    assert "-movflags" in command


def test_ffmpeg_adapter_preserves_source_audio_without_external_track(tmp_path: Path):
    """未指定外部音频时，合成命令保留源视频音轨并为静音片段补齐音频。"""
    adapter = FfmpegVideoCompositionAdapter()
    command = adapter._build_command(
        VideoCompositionRequest(
            video_paths=[tmp_path / "with-audio.mp4", tmp_path / "without-audio.mp4"],
            audio_path=None,
            output_path=tmp_path / "final.mp4",
            width=720,
            height=1280,
        ),
        tmp_path / "temporary.mp4",
        [
            _SourceMediaInfo(has_audio=True, duration_seconds=5.0),
            _SourceMediaInfo(has_audio=False, duration_seconds=4.0),
        ],
    )
    filter_complex = command[command.index("-filter_complex") + 1]

    assert "concat=n=2:v=1:a=1[vout][aout]" in filter_complex
    assert "-map" in command
    assert "[aout]" in command
    assert "-an" not in command
    assert "anullsrc=r=48000:cl=stereo" in command


@pytest.mark.asyncio
async def test_compose_tool_writes_completed_result_with_mock_adapter(workspace: Path):
    """合成工具使用 mock 适配器后写回 completed 结果 Content。"""
    project_name = "composition-project"
    project_dir = workspace / project_name
    await async_mkdir(project_dir / "videos", parents=True, exist_ok=True)
    await async_mkdir(project_dir / "audio", parents=True, exist_ok=True)
    await async_write_bytes(project_dir / "videos" / "one.mp4", b"mock-video-one")
    await async_write_bytes(project_dir / "videos" / "two.mp4", b"mock-video-two")
    await async_write_bytes(project_dir / "audio" / "narration.mp3", b"mock-audio")
    await write_magic_project_js_v3(project_name, _composition_config())
    tool = ComposeCanvasVideo(base_dir=str(workspace))
    tool._composition_adapter.compose = AsyncMock(
        return_value=VideoCompositionResult(
            output_path=project_dir / "videos" / "final.mp4",
            width=720,
            height=1280,
            duration_seconds=8.0,
            has_audio=True,
        )
    )

    result = await tool.execute(
        None,
        ComposeCanvasVideoParams(
            project_path=project_name,
            video_edit_element_id="video-edit-1",
            result_name="模拟最终视频",
        ),
    )

    assert result.ok
    manager = (await tool._get_canvas_manager(project_name))[1]
    config = await manager.read_current_canvas()
    result_element = config.canvas.get_element(result.data["result_element_id"])
    result_content = result_element.get_content(result.data["result_content_id"])
    assert result_content.fields["status"] == "completed"
    assert result_content.fields["src"] == result.data["src"]
    assert result.data["duration_seconds"] == 8.0
    assert f'Final MP4 was created at "{result.data["src"]}"' in result.content
    assert "Dimensions: 720x1280." in result.content
    assert "Duration: 8.00 seconds." in result.content
    assert "Audio included: yes." in result.content


@pytest.mark.asyncio
async def test_compose_tool_marks_result_failed_when_adapter_fails(workspace: Path):
    """FFmpeg 适配器失败后保留结果占位并写入精简失败状态。"""
    project_name = "failed-composition-project"
    project_dir = workspace / project_name
    await async_mkdir(project_dir / "videos", parents=True, exist_ok=True)
    await async_mkdir(project_dir / "audio", parents=True, exist_ok=True)
    await async_write_bytes(project_dir / "videos" / "one.mp4", b"mock-video-one")
    await async_write_bytes(project_dir / "videos" / "two.mp4", b"mock-video-two")
    await async_write_bytes(project_dir / "audio" / "narration.mp3", b"mock-audio")
    await write_magic_project_js_v3(project_name, _composition_config())
    tool = ComposeCanvasVideo(base_dir=str(workspace))
    tool._composition_adapter.compose = AsyncMock(
        side_effect=VideoCompositionError("mock incompatible media")
    )

    result = await tool.execute(
        None,
        ComposeCanvasVideoParams(
            project_path=project_name,
            video_edit_element_id="video-edit-1",
            result_name="失败模拟成片",
        ),
    )

    assert not result.ok
    manager = (await tool._get_canvas_manager(project_name))[1]
    config = await manager.read_current_canvas()
    failed_elements = [
        element
        for element in config.canvas.elements
        if element.type == "video" and element.name == "失败模拟成片"
    ]
    assert len(failed_elements) == 1
    failed_content = failed_elements[0].get_active_content()
    assert failed_content.fields["status"] == "failed"
    assert "Check the input media" in failed_content.fields["errorMessage"]
