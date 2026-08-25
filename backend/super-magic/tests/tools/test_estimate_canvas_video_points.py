import pytest

from agentlang.context.tool_context import ToolContext
from app.infrastructure.magic_service.exceptions import ApiError
from app.tools.design.tools.generate_canvas_videos import (
    GenerateCanvasVideos,
    GenerateCanvasVideosParams,
    VideoTaskSpec,
)


def test_design_video_request_builder_keeps_estimate_and_generate_parameters_aligned():
    task = VideoTaskSpec(
        prompt="参考旅行者 [image1] 沿着雪山小路前行，镜头缓慢跟随。",
        name="雪山旅行",
        aspect_ratio="16:9",
        duration_seconds=5,
        resolution="768p",
        reference_image_paths=["demo/images/traveler.png"],
        extensions={"provider_option": "value"},
    )
    tool = GenerateCanvasVideos(base_dir="/workspace")

    estimate = tool._build_estimate_design_video_request(
        task=task,
        project_id="123",
        model_id="MiniMax-H3",
        relative_project_path="demo",
    )
    generate = tool._build_design_video_request(
        task=task,
        project_id="123",
        video_id="vid-1",
        model_id="MiniMax-H3",
        file_dir="/demo/videos/",
        relative_project_path="demo",
    )

    assert estimate == {
        "project_id": "123",
        "model_id": "MiniMax-H3",
        "prompt": task.prompt,
        "input_mode": "omni_reference",
        "task": "generate",
        "inputs": {
            "reference_images": [{"uri": "/demo/images/traveler.png"}],
            "reference_videos": [],
            "reference_audios": [],
            "frames": [],
        },
        "generation": {
            "aspect_ratio": "16:9",
            "duration_seconds": 5,
            "resolution": "768p",
        },
        "extensions": {"provider_option": "value"},
    }
    assert generate == {
        **estimate,
        "video_id": "vid-1",
        "file_dir": "/demo/videos/",
    }


def test_generate_canvas_videos_params_support_estimate_operation():
    params = GenerateCanvasVideosParams(
        project_path="demo",
        model_id="MiniMax-H3",
        action="estimate_points",
        tasks=[{"name": "video-1", "prompt": "城市夜景延时摄影。"}],
    )

    assert params.action == "estimate_points"


def test_generate_canvas_videos_defaults_to_generate_operation():
    params = GenerateCanvasVideosParams(
        project_path="demo",
        model_id="MiniMax-H3",
        tasks=[{"name": "video-1", "prompt": "城市夜景延时摄影。"}],
    )

    assert params.action == "generate"


@pytest.mark.asyncio
async def test_generate_canvas_videos_estimation_sums_tasks_without_generating(monkeypatch):
    estimated_payloads = []
    generated_payloads = []

    class FakeMagicServiceClient:
        async def estimate_design_video_points(self, payload):
            estimated_payloads.append(payload)
            return {"points": 3 if len(estimated_payloads) == 1 else 5}

        async def generate_design_video(self, payload):
            generated_payloads.append(payload)
            raise AssertionError("estimation mode must not submit generation")

    tool = GenerateCanvasVideos()
    tool._magic_service_client = FakeMagicServiceClient()
    monkeypatch.setattr(tool, "_resolve_project_id", lambda: "123")

    async def fail_if_generation_flow_runs(*args, **kwargs):
        raise AssertionError("estimation mode must not create placeholders")

    monkeypatch.setattr(tool, "_run_generate_flow", fail_if_generation_flow_runs)
    params = GenerateCanvasVideosParams(
        project_path="demo",
        model_id="MiniMax-H3",
        action="estimate_points",
        tasks=[
            {"name": "video-1", "prompt": "一只小猫缓慢走过木桥。"},
            {"name": "video-2", "prompt": "一只小狗在草地上奔跑。"},
        ],
    )

    result = await tool.execute(ToolContext(), params)

    assert result.ok
    assert result.data["items"] == [
        {"name": "video-1", "points": 3},
        {"name": "video-2", "points": 5},
    ]
    assert result.data["total_points"] == 8
    assert "video-1：3 积分" in result.content
    assert "video-2：5 积分" in result.content
    assert "总计：8 积分" in result.content
    assert len(estimated_payloads) == 2
    assert generated_payloads == []


@pytest.mark.asyncio
async def test_estimate_points_uses_estimation_friendly_message_without_design_detail():
    tool = GenerateCanvasVideos()
    result = await tool.get_after_tool_call_friendly_action_and_remark(
        "generate_canvas_videos",
        ToolContext(),
        result=type("Result", (), {"ok": True, "content": "视频积分预估完成：总计：8 积分。"})(),
        execution_time=0.1,
        arguments={"action": "estimate_points"},
    )

    assert result == {
        "action": "预估视频积分",
        "remark": "视频积分预估完成：总计：8 积分。",
    }

    detail = await tool.get_tool_detail(
        ToolContext(),
        result=type("Result", (), {"ok": True})(),
        arguments={"action": "estimate_points"},
    )
    assert detail is None


@pytest.mark.asyncio
async def test_generate_canvas_videos_estimation_normalizes_project_relative_references(
    monkeypatch,
    tmp_path,
):
    image_path = tmp_path / "demo" / "images" / "cat.png"
    image_path.parent.mkdir(parents=True)
    image_path.write_bytes(b"image")
    estimated_payloads = []

    class FakeMagicServiceClient:
        async def estimate_design_video_points(self, payload):
            estimated_payloads.append(payload)
            return {"points": 1}

    tool = GenerateCanvasVideos(base_dir=tmp_path)
    tool._magic_service_client = FakeMagicServiceClient()
    monkeypatch.setattr(tool, "_resolve_project_id", lambda: "123")
    params = GenerateCanvasVideosParams(
        project_path="demo",
        model_id="MiniMax-H3",
        action="estimate_points",
        tasks=[
            {
                "name": "reference-video",
                "prompt": "参考小猫 [image1] 缓慢走过木桥。",
                "reference_image_paths": ["images/cat.png"],
            }
        ],
    )

    result = await tool.execute(ToolContext(), params)

    assert result.ok
    assert estimated_payloads[0]["inputs"]["reference_images"] == [
        {"uri": "/demo/images/cat.png"}
    ]


@pytest.mark.asyncio
async def test_generate_canvas_videos_estimation_returns_simple_error_without_retry(monkeypatch):
    calls = 0

    class FakeMagicServiceClient:
        async def estimate_design_video_points(self, payload):
            nonlocal calls
            calls += 1
            raise ApiError("积分服务不可用")

    tool = GenerateCanvasVideos()
    tool._magic_service_client = FakeMagicServiceClient()
    monkeypatch.setattr(tool, "_resolve_project_id", lambda: "123")
    params = GenerateCanvasVideosParams(
        project_path="demo",
        model_id="MiniMax-H3",
        action="estimate_points",
        tasks=[{"name": "video-1", "prompt": "城市夜景延时摄影。"}],
    )

    result = await tool.execute(ToolContext(), params)

    assert not result.ok
    assert result.content == "视频积分预估失败：积分服务不可用"
    assert calls == 1


@pytest.mark.asyncio
async def test_generate_canvas_videos_estimation_rejects_missing_points(monkeypatch):
    class FakeMagicServiceClient:
        async def estimate_design_video_points(self, payload):
            return {}

    tool = GenerateCanvasVideos()
    tool._magic_service_client = FakeMagicServiceClient()
    monkeypatch.setattr(tool, "_resolve_project_id", lambda: "123")
    params = GenerateCanvasVideosParams(
        project_path="demo",
        model_id="MiniMax-H3",
        action="estimate_points",
        tasks=[{"name": "video-1", "prompt": "城市夜景延时摄影。"}],
    )

    result = await tool.execute(ToolContext(), params)

    assert not result.ok
    assert result.content == "视频积分预估失败：积分预估结果缺少有效 points"


@pytest.mark.asyncio
async def test_generate_canvas_videos_estimation_rejects_non_finite_points(monkeypatch):
    class FakeMagicServiceClient:
        async def estimate_design_video_points(self, payload):
            return {"points": float("nan")}

    tool = GenerateCanvasVideos()
    tool._magic_service_client = FakeMagicServiceClient()
    monkeypatch.setattr(tool, "_resolve_project_id", lambda: "123")
    params = GenerateCanvasVideosParams(
        project_path="demo",
        model_id="MiniMax-H3",
        action="estimate_points",
        tasks=[{"name": "video-1", "prompt": "城市夜景延时摄影。"}],
    )

    result = await tool.execute(ToolContext(), params)

    assert not result.ok
    assert result.content == "视频积分预估失败：积分预估结果缺少有效 points"


def test_only_generate_canvas_videos_is_exported_for_video_estimation_and_generation():
    import app.tools as root_tools
    import app.tools.design as design_tools
    import app.tools.design.tools as design_tool_classes

    assert hasattr(root_tools, "GenerateCanvasVideos")
    assert hasattr(design_tools, "GenerateCanvasVideos")
    assert hasattr(design_tool_classes, "GenerateCanvasVideos")
    assert not hasattr(root_tools, "EstimateCanvasVideoPoints")
    assert not hasattr(design_tools, "EstimateCanvasVideoPoints")
    assert not hasattr(design_tool_classes, "EstimateCanvasVideoPoints")
