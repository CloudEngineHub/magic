"""Canvas 旧 Design 视频适配器的 mock 测试。"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.infrastructure.magic_service.client import MagicServiceClient
from app.tools.canvas.application.commands import GenerationParameters
from app.tools.canvas.generation.adapters.design_video_generation_port import DesignVideoGenerationPort
from app.tools.canvas.generation.adapters.design_video_payload_builder import DesignVideoPayloadBuilder
from app.tools.canvas.generation.capability.default_capability_factory import default_generation_capabilities
from app.tools.canvas.generation.contracts.generation_query_request import GenerationQueryRequest
from app.tools.canvas.generation.contracts.generation_request import GenerationRequest
from app.tools.canvas.production.adapters.design_video_point_estimate_port import DesignVideoPointEstimatePort
from app.tools.canvas.production.contracts import NormalizedVideoProductionRequest


class _ToolContext:
    """提供测试所需项目元数据的最小工具上下文。"""

    def get_metadata(self, key: str) -> str:
        """返回 mock 项目 ID。"""
        return "magic-project-1" if key == "project_id" else ""

    def get_extension(self, _key: str):
        """测试中不提供额外 Agent 扩展。"""
        return None


def test_design_video_payload_maps_canvas_parameters_and_provider_uri(tmp_path: Path) -> None:
    """请求体应符合旧 Design API，并原样保留 provider 资产 URI。"""
    payload = DesignVideoPayloadBuilder(tmp_path).build(
        "mock-project",
        GenerationParameters(
            prompt="animate [image1]",
            model_id="video-model",
            reference_image_paths=("./images/source.png", "asset://provider/image-1"),
            frame_start_path="./images/start.png",
            duration_seconds=4,
            aspect_ratio="16:9",
            resolution="720p",
            fps=24,
            seed=7,
            watermark=False,
        ),
        "vid-1",
        "/mock-project/videos/",
        _ToolContext(),
    )

    assert payload["project_id"] == "magic-project-1"
    assert payload["video_id"] == "vid-1"
    assert payload["file_dir"] == "/mock-project/videos/"
    assert payload["inputs"]["reference_images"] == [
        {"uri": "/mock-project/images/source.png"},
        {"uri": "asset://provider/image-1"},
    ]
    assert payload["inputs"]["frames"] == [{"role": "start", "uri": "/mock-project/images/start.png"}]
    assert payload["generation"] == {
        "aspect_ratio": "16:9",
        "duration_seconds": 4,
        "resolution": "720p",
        "fps": 24,
        "seed": 7,
        "watermark": False,
    }


def test_default_canvas_video_capability_uses_design_adapter(tmp_path: Path, monkeypatch) -> None:
    """非 fake 模式的默认视频能力应注册 Design API 适配器。"""
    monkeypatch.delenv("CANVAS_FAKE_GENERATION", raising=False)
    capabilities = default_generation_capabilities(tmp_path)

    video = next(capability for capability in capabilities if capability.element_type == "video")
    assert isinstance(video.submission_port, DesignVideoGenerationPort)


@pytest.mark.asyncio
async def test_design_video_generation_uses_design_submit_and_query_endpoints(tmp_path: Path, monkeypatch) -> None:
    """本地调试模式提交和查询旧 Design API，完成后下载到 Canvas videos 目录。"""
    monkeypatch.setenv("ENABLE_LOCAL_DEBUG_MODE", "true")
    calls: dict[str, object] = {}

    async def generate(self, payload):
        """返回 mock Design 提交结果。"""
        calls["submit"] = payload
        return {"status": "processing", "video_id": "remote-video-1"}

    async def query(self, project_id, video_id):
        """返回 mock Design 完成结果。"""
        calls["query"] = (project_id, video_id)
        return {"status": "completed", "file_url": "https://mock.invalid/video.mp4"}

    async def download(self, url, target):
        """将 mock 下载结果写入目标文件。"""
        calls["download"] = (url, target)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b"mock-video")

    monkeypatch.setattr(MagicServiceClient, "generate_design_video", generate)
    monkeypatch.setattr(MagicServiceClient, "query_video_generation_result", query)
    monkeypatch.setattr(MagicServiceClient, "download_url_to_path", download)

    port = DesignVideoGenerationPort(tmp_path)
    submission = await port.submit(
        GenerationRequest(
            project_path="mock-project",
            element_id="element-1",
            content_id="content-1",
            element_type="video",
            parameters=GenerationParameters(prompt="mock", model_id="model-1", name="城市街景"),
        ),
        _ToolContext(),
    )
    output_filename = submission.request_metadata["outputFilename"]
    result = await port.query(
        GenerationQueryRequest("remote-video-1", "mock-project", "element-1", "content-1", output_filename),
        _ToolContext(),
    )

    assert submission.provider_task_id == "remote-video-1"
    assert len(calls["submit"]["video_id"]) == 20
    assert output_filename.startswith("城市街景-vid_")
    assert calls["submit"]["project_id"] == "magic-project-1"
    assert calls["query"] == ("magic-project-1", "remote-video-1")
    assert result.status == "completed"
    assert result.output_uri == f"./videos/{output_filename}"


@pytest.mark.asyncio
async def test_design_video_generation_uses_magic_service_workspace_file_without_download(
    tmp_path: Path,
    monkeypatch,
) -> None:
    """部署模式应复用 Magic Service 已归档的工作区文件，不重复下载。"""
    monkeypatch.delenv("ENABLE_LOCAL_DEBUG_MODE", raising=False)
    calls: dict[str, object] = {}

    async def generate(self, payload):
        """返回 mock Design 提交结果。"""
        return {"status": "processing", "video_id": "remote-video-2"}

    async def query(self, project_id, video_id):
        """返回 Magic Service 已归档的文件信息。"""
        calls["query"] = (project_id, video_id)
        return {
            "status": "completed",
            "file_dir": "/mock-project/videos/",
            "file_name": "llm-named-video.mp4",
        }

    async def download(self, url, target):
        """记录不应发生的下载调用。"""
        calls["download"] = (url, target)

    monkeypatch.setattr(MagicServiceClient, "generate_design_video", generate)
    monkeypatch.setattr(MagicServiceClient, "query_video_generation_result", query)
    monkeypatch.setattr(MagicServiceClient, "download_url_to_path", download)

    port = DesignVideoGenerationPort(tmp_path)
    submission = await port.submit(
        GenerationRequest(
            project_path="mock-project",
            element_id="element-1",
            content_id="content-1",
            element_type="video",
            parameters=GenerationParameters(prompt="mock", model_id="model-1", name="城市街景"),
        ),
        _ToolContext(),
    )
    result = await port.query(
        GenerationQueryRequest("remote-video-2", "mock-project", "element-1", "content-1", submission.request_metadata["outputFilename"]),
        _ToolContext(),
    )

    assert calls["query"] == ("magic-project-1", "remote-video-2")
    assert "download" not in calls
    assert result.status == "completed"
    assert result.output_uri == "./videos/llm-named-video.mp4"


@pytest.mark.asyncio
async def test_design_video_point_estimate_uses_design_estimate_endpoint(monkeypatch, tmp_path: Path) -> None:
    """Canvas 视频积分预估必须调用 Design 估算接口。"""
    calls: dict[str, object] = {}

    async def estimate(self, payload):
        """返回 mock Design 积分结果。"""
        calls["payload"] = payload
        return {"points": 9}

    monkeypatch.setattr(MagicServiceClient, "estimate_design_video_points", estimate)
    request = NormalizedVideoProductionRequest(
        "mock-project",
        "item-1",
        GenerationParameters(prompt="mock", model_id="model-1"),
        "fingerprint",
    )

    points = await DesignVideoPointEstimatePort(tmp_path).estimate_points(request, _ToolContext())

    assert points == 9
    assert calls["payload"]["project_id"] == "magic-project-1"
