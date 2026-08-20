"""Canvas 内容产出能力的 mock 测试。"""

from __future__ import annotations

import pytest

from app.infrastructure.magic_service.client import MagicServiceClient
from app.tools.canvas.application.commands import GenerationParameters
from app.tools.canvas.domain.content_fields import AudioContentFields, VideoContentFields, VideoEditContentFields
from app.tools.canvas.domain.models import CanvasConnection, CanvasContent, CanvasElement, ElementProperties
from app.tools.canvas.production.adapters import (
    FakeAssetDownloadPort,
    FakeImageSearchPort,
    FakeMediaProbePort,
    FakeVideoCompositionPort,
)
from app.tools.canvas.production.adapters.generic_video_point_estimate_port import GenericVideoPointEstimatePort
from app.tools.canvas.production.contracts import ImageSearchTask, VideoCompositionCommand, VideoPointEstimateItem
from app.tools.canvas.production.estimation.video_production_request_normalizer import VideoProductionRequestNormalizer
from app.tools.canvas.production.ports import ImageSearchCandidate
from app.tools.canvas.repository import CanvasRepository
from app.tools.generate_video import GenerateVideo
from app.utils.async_file_utils import async_mkdir, async_write_bytes
from tests.tools.canvas.helpers import create_test_application


@pytest.mark.asyncio
async def test_generic_video_point_estimate_calls_magic_service_endpoint_directly(tmp_path, monkeypatch) -> None:
    """积分预估直接调用 Magic Service，不经过生成工具的 execute_purely。"""
    request = VideoProductionRequestNormalizer().normalize(
        "mock-project",
        "shot-1",
        GenerationParameters(prompt="mock video", model_id="mock-model"),
    )
    calls: dict[str, object] = {}

    async def build_payload(self, tool_context, params):
        """返回测试用的视频预估请求体。"""
        calls["params"] = params
        return {"model_id": "mock-model", "prompt": "mock video"}

    async def estimate_video_points(self, payload, request_id=""):
        """返回测试用的积分结果。"""
        calls["payload"] = payload
        calls["request_id"] = request_id
        return {"points": 12}

    async def execute_purely(*args, **kwargs):
        """如果错误调用生成工具，测试应立即失败。"""
        raise AssertionError("point estimation must not call execute_purely")

    monkeypatch.setattr(GenerateVideo, "_build_payload", build_payload)
    monkeypatch.setattr(GenerateVideo, "execute_purely", execute_purely)
    monkeypatch.setattr(MagicServiceClient, "estimate_video_points", estimate_video_points)

    points = await GenericVideoPointEstimatePort(tmp_path).estimate_points(request, None)

    assert points == 12
    assert calls["payload"] == {"model_id": "mock-model", "prompt": "mock video"}
    assert isinstance(calls["request_id"], str) and calls["request_id"]


@pytest.mark.asyncio
async def test_video_point_estimate_has_no_canvas_side_effect(tmp_path, monkeypatch) -> None:
    """视频积分预估只保存凭证，不新增 Element、Content 或生成任务。"""
    monkeypatch.setenv("CANVAS_FAKE_GENERATION", "1")
    repository = CanvasRepository(tmp_path)
    application = create_test_application(repository)
    await application.initialize("mock-project")

    result = await application.estimate_content_points(
        "mock-project",
        "video_generation",
        [VideoPointEstimateItem("shot-1", GenerationParameters(prompt="mock video", duration_seconds=4))],
    )

    assert result["can_continue"] is True
    assert result["total_points"] == 10
    assert result["estimate_id"]
    assert (await application.overview("mock-project", 1, 50))["total_elements"] == 0


@pytest.mark.asyncio
async def test_image_search_imports_only_downloaded_and_probed_candidates(tmp_path) -> None:
    """图片搜索只物化下载和媒体探测成功的候选，并按主题去重。"""
    repository = CanvasRepository(tmp_path)
    search = FakeImageSearchPort([
        ImageSearchCandidate("https://mock.invalid/a.png", "A", 800, 600),
        ImageSearchCandidate("https://mock.invalid/a.png", "A duplicate", 800, 600),
    ])
    application = create_test_application(
        repository,
        image_search_port=search,
        asset_download_port=FakeAssetDownloadPort(),
        media_probe_port=FakeMediaProbePort(),
    )
    await application.initialize("mock-project")

    first = await application.search_images(
        "mock-project",
        "topic-1",
        [ImageSearchTask("images", "hero", "product", expected_aspect_ratio="4:3", count=3)],
    )
    second = await application.search_images(
        "mock-project",
        "topic-1",
        [ImageSearchTask("images-again", "hero", "product", expected_aspect_ratio="4:3", count=3)],
    )

    assert first["items"][0]["imported_count"] == 1
    assert second["items"][0]["status"] == "failed"
    assert (await application.overview("mock-project", 1, 50))["total_elements"] == 1


@pytest.mark.asyncio
async def test_video_composition_creates_result_element_and_audio_sequence(tmp_path) -> None:
    """视频合成读取 Video Edit 的有序视频和单条音频输入。"""
    repository = CanvasRepository(tmp_path)
    application = create_test_application(repository, video_composition_port=FakeVideoCompositionPort())
    await application.initialize("mock-project")
    await async_mkdir(tmp_path / "mock-project" / "videos", parents=True, exist_ok=True)
    await async_mkdir(tmp_path / "mock-project" / "audio", parents=True, exist_ok=True)
    await async_write_bytes(tmp_path / "mock-project" / "videos" / "one.mp4", b"mock")
    await async_write_bytes(tmp_path / "mock-project" / "videos" / "two.mp4", b"mock")
    await async_write_bytes(tmp_path / "mock-project" / "audio" / "track.mp3", b"mock")

    def seed(project):
        """写入最小的 mock 合成图。"""
        video_1 = CanvasElement("video-1", "video", ElementProperties(width=720, height=1280), [CanvasContent("video-1-content", VideoContentFields(src="./videos/one.mp4", status="completed"))], "video-1-content", "video-1-content")
        video_2 = CanvasElement("video-2", "video", ElementProperties(width=720, height=1280), [CanvasContent("video-2-content", VideoContentFields(src="./videos/two.mp4", status="completed"))], "video-2-content", "video-2-content")
        audio = CanvasElement("audio-1", "audio", ElementProperties(width=720, height=1280), [CanvasContent("audio-1-content", AudioContentFields(src="./audio/track.mp3"))], "audio-1-content", "audio-1-content")
        edit = CanvasElement("edit-1", "video-edit", ElementProperties(name="edit"), [CanvasContent("edit-content", VideoEditContentFields(video_sequence=["video-1", "video-2"], audio_sequence=["audio-1"], output={"format": "mp4", "aspectRatio": "16:9", "resolution": "720p"}))], "edit-content", "edit-content")
        project.canvas.elements.extend([video_1, video_2, audio, edit])
        project.canvas.connections.extend([CanvasConnection("c1", "video-1", "edit-1"), CanvasConnection("c2", "video-2", "edit-1"), CanvasConnection("c3", "audio-1", "edit-1")])

    await repository.transaction("mock-project", seed)
    result = await application.compose_video("mock-project", VideoCompositionCommand("edit-1", "final"))

    assert result["result_element_id"]
    assert result["result_content_id"]
    assert result["src"].startswith("./videos/")
