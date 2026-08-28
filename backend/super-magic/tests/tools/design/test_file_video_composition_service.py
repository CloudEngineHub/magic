"""文件列表视频合成服务测试。"""

from pathlib import Path

import pytest

from app.tools.design.video_production.ports.video_composition_port import VideoSourceInfo
from app.tools.design.video_production.service.file_video_composition_service import (
    FileVideoCompositionService,
)


class _MockCompositionAdapter:
    """提供媒体分析结果的测试适配器。"""

    def __init__(self, infos: list[VideoSourceInfo]) -> None:
        self._infos = iter(infos)

    async def inspect_video(self, _path: Path) -> VideoSourceInfo:
        """返回预置媒体规格。"""
        return next(self._infos)


@pytest.mark.asyncio
async def test_default_dimensions_follow_first_video(tmp_path: Path):
    """未提供 generation 时使用第一个视频的原始尺寸。"""
    first = tmp_path / "project" / "videos" / "a.mp4"
    second = tmp_path / "project" / "videos" / "b.mp4"
    first.parent.mkdir(parents=True)
    first.write_bytes(b"mock")
    second.write_bytes(b"mock")
    service = FileVideoCompositionService(
        _MockCompositionAdapter([
            VideoSourceInfo(1920, 1080, 3.0, True),
            VideoSourceInfo(1080, 1920, 4.0, False),
        ])
    )

    plan = await service.build_plan(
        workspace_dir=tmp_path,
        file_dir="/project/videos/",
        composition={"videos": [{"path": "/project/videos/a.mp4"}, {"path": "/project/videos/b.mp4"}]},
        generation={},
        output_file_name="",
        task_id="task-1",
    )

    assert (plan.request.width, plan.request.height) == (1920, 1080)
    assert plan.output_relative_path == "./project/videos/composition-task-1.mp4"


@pytest.mark.asyncio
async def test_explicit_generation_overrides_aspect_ratio_and_resolution(tmp_path: Path):
    """显式 generation 规格覆盖默认输出尺寸。"""
    source = tmp_path / "video.mp4"
    source.write_bytes(b"mock")
    service = FileVideoCompositionService(
        _MockCompositionAdapter([VideoSourceInfo(1920, 1080, 3.0, False)])
    )

    plan = await service.build_plan(
        workspace_dir=tmp_path,
        file_dir="/videos",
        composition={"videos": [{"path": "/video.mp4"}]},
        generation={"aspect_ratio": "9:16", "resolution": "480p", "duration_seconds": 4},
        output_file_name="final.mp4",
        task_id="task-2",
    )

    assert (plan.request.width, plan.request.height) == (480, 852)


@pytest.mark.asyncio
async def test_multiple_audio_files_are_rejected(tmp_path: Path):
    """首版不允许多个外部音频。"""
    source = tmp_path / "video.mp4"
    source.write_bytes(b"mock")
    service = FileVideoCompositionService(
        _MockCompositionAdapter([VideoSourceInfo(1920, 1080, 3.0, False)])
    )

    with pytest.raises(ValueError, match="at most one audio"):
        await service.build_plan(
            workspace_dir=tmp_path,
            file_dir="/videos",
            composition={
                "videos": [{"path": "/video.mp4"}],
                "audios": [{"path": "/a.mp3"}, {"path": "/b.mp3"}],
            },
            generation={},
            output_file_name="final.mp4",
            task_id="task-3",
        )
