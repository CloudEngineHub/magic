import pytest
from pydantic import ValidationError

from agentlang.context.tool_context import ToolContext
from app.core.models.agent_model_context import AgentModelContext
from app.core.models.agent_model_selection import AgentModelSelection
from app.core.models.media_model import VideoModelSpec
from app.infrastructure.magic_service.config import MagicServiceConfig
from app.infrastructure.magic_service.design_video_client import DesignVideoClient, DesignVideoServiceError
from app.tools.design.tools.generate_canvas_videos import GenerateCanvasVideos, GenerateCanvasVideosParams, VideoTaskSpec
from app.tools.design.tools.base_generate_canvas_elements import ElementDetail


def test_design_video_client_forwards_user_auth_and_organization(monkeypatch):
    metadata = {
        "authorization": "test-user-token",
        "organization_code": "test-org",
        "super_magic_task_id": "task-1",
    }

    monkeypatch.setattr(
        "app.infrastructure.magic_service.design_video_client.MetadataUtil.add_magic_and_user_authorization_headers",
        lambda headers: None,
    )
    monkeypatch.setattr(
        "app.infrastructure.magic_service.design_video_client.MetadataUtil.is_initialized",
        lambda: True,
    )
    monkeypatch.setattr(
        "app.infrastructure.magic_service.design_video_client.MetadataUtil.get_metadata",
        lambda: metadata,
    )

    client = DesignVideoClient(config=MagicServiceConfig(api_base_url="http://magic-service.test"))

    headers = client._build_headers()

    assert headers["User-Authorization"] == "test-user-token"
    assert headers["organization-code"] == "test-org"
    assert headers["Magic-Task-Id"] == "task-1"


def test_video_task_spec_normalizes_input_mode_aliases_from_llm():
    task = VideoTaskSpec(
        prompt="把参考视频改成水彩风格",
        name="水彩视频编辑",
        size="1280x720",
        inputMode="video_editing",
        task="edit",
    )

    assert task.input_mode == "video_edit"
    assert task.task == "edit"


def test_video_task_spec_requires_reference_image_tokens():
    with pytest.raises(ValidationError, match=r"\[image1\].*\[image2\]"):
        VideoTaskSpec(
            prompt="两只猫依次从箱子里跳出来",
            name="箱子跳猫",
            size="1280x720",
            reference_image_paths=["images/white-cat.jpg", "images/black-cat.jpg"],
        )


def test_video_task_spec_allows_reference_image_tokens():
    task = VideoTaskSpec(
        prompt="白色小猫 [image1] 从黑色箱子探头，黑色小猫 [image2] 从白色箱子跳出",
        name="箱子跳猫",
        size="1280x720",
        reference_image_paths=["images/white-cat.jpg", "images/black-cat.jpg"],
    )

    assert task.reference_image_paths == ["images/white-cat.jpg", "images/black-cat.jpg"]


@pytest.mark.asyncio
async def test_generate_canvas_videos_normalizes_project_relative_reference_paths(tmp_path):
    project_dir = tmp_path / "demo-project"
    (project_dir / "images").mkdir(parents=True)
    (project_dir / "videos").mkdir(parents=True)
    (project_dir / "audios").mkdir(parents=True)
    (project_dir / "frames").mkdir(parents=True)
    (project_dir / "images" / "ref.jpg").write_bytes(b"fake-image")
    (project_dir / "videos" / "ref.mp4").write_bytes(b"fake-video")
    (project_dir / "audios" / "ref.mp3").write_bytes(b"fake-audio")
    (project_dir / "frames" / "start.jpg").write_bytes(b"fake-start")
    (project_dir / "frames" / "end.jpg").write_bytes(b"fake-end")

    tool = GenerateCanvasVideos(base_dir=str(tmp_path))
    task = VideoTaskSpec(
        prompt=(
            "让白色小猫 [image1] 参考备选图 [image2]，按参考视频 [video1] 的节奏移动，"
            "并配合音频 [audio1]，从起始帧过渡到结束帧"
        ),
        name="项目相对参考素材",
        size="1280x720",
        reference_image_paths=["images/ref.jpg", "https://cdn.example.com/ref.jpg"],
        reference_video_paths=["videos/ref.mp4"],
        reference_audio_paths=["audios/ref.mp3"],
        frame_start_path="frames/start.jpg",
        frame_end_path="frames/end.jpg",
    )

    await tool._normalize_reference_paths([task], tmp_path, "demo-project")

    assert task.reference_image_paths == [
        "demo-project/images/ref.jpg",
        "https://cdn.example.com/ref.jpg",
    ]
    assert task.reference_video_paths == ["demo-project/videos/ref.mp4"]
    assert task.reference_audio_paths == ["demo-project/audios/ref.mp3"]
    assert task.frame_start_path == "demo-project/frames/start.jpg"
    assert task.frame_end_path == "demo-project/frames/end.jpg"


def test_video_task_spec_requires_video_and_audio_tokens():
    with pytest.raises(ValidationError, match=r"\[video1\].*\[audio1\]"):
        VideoTaskSpec(
            prompt="参考视频节奏和音频氛围生成广告片",
            name="广告片",
            size="1280x720",
            reference_video_paths=["videos/ref.mp4"],
            reference_audio_paths=["audios/ref.mp3"],
        )


@pytest.mark.asyncio
async def test_generate_canvas_videos_does_not_create_placeholder_when_prepare_fails(
    monkeypatch,
    tmp_path,
):
    project_dir = tmp_path / "demo-project"
    project_dir.mkdir(parents=True)
    project_file = project_dir / "magic.project.js"
    project_file.write_text(
        'window.magicProjectConfig = {"version":"1.0.0","type":"design","name":"demo-project",'
        '"canvas":{"elements":[]}}',
        encoding="utf-8",
    )

    tool = GenerateCanvasVideos(base_dir=str(tmp_path))

    async def fail_prepare(*args, **kwargs):
        raise ValueError("缺少 project_id，无法创建后台托管的视频任务")

    monkeypatch.setattr(tool, "_prepare_task_kwargs", fail_prepare)

    result = await tool.execute(
        None,
        GenerateCanvasVideosParams(
            project_path="demo-project",
            model_id="doubao-seedance-2-0-260128",
            tasks=[
                VideoTaskSpec(
                    prompt="一只橘猫坐在老式电车窗边看雨夜霓虹",
                    name="雨夜电车橘猫",
                    size="1280x720",
                    duration_seconds=4,
                )
            ],
        ),
    )

    assert not result.ok
    assert "缺少 project_id" in result.content
    assert "雨夜电车橘猫" not in project_file.read_text(encoding="utf-8")


def test_generate_canvas_videos_params_uses_size_for_canvas_dimensions():
    params = GenerateCanvasVideosParams(
        project_path="demo-project",
        tasks=[
            {
                "prompt": "生成一个 16:9 的 720p 广告短片",
                "name": "广告短片",
                "size": "1280x720",
            }
        ],
    )

    assert params.tasks[0].canvas_dimensions == (1280, 720)
    assert "width" not in params.tasks[0].model_fields_set
    assert "height" not in params.tasks[0].model_fields_set


def test_generate_canvas_videos_params_ignores_legacy_canvas_dimensions_when_size_exists():
    params = GenerateCanvasVideosParams(
        project_path="demo-project",
        tasks=[
            {
                "prompt": "生成一个 16:9 的 720p 广告短片",
                "name": "广告短片",
                "size": "1280x720",
                "width": 640,
                "height": 360,
            }
        ],
    )

    assert params.tasks[0].canvas_dimensions == (1280, 720)


def test_generate_canvas_videos_params_requires_size():
    with pytest.raises(ValidationError) as exc:
        GenerateCanvasVideosParams(
            project_path="demo-project",
            tasks=[
                {
                    "prompt": "生成一个 16:9 的 720p 广告短片",
                    "name": "广告短片",
                }
            ],
        )

    message = str(exc.value)
    assert "requires size" in message
    assert "tasks.0.size" in message


def test_generate_canvas_videos_params_rejects_invalid_size_with_english_message():
    with pytest.raises(ValidationError) as exc:
        GenerateCanvasVideosParams(
            project_path="demo-project",
            tasks=[
                {
                    "prompt": "生成一个广告短片",
                    "name": "广告短片",
                    "size": "720p",
                }
            ],
        )

    message = str(exc.value)
    assert "Invalid size format" in message
    assert "WIDTHxHEIGHT" in message
    assert "格式无效" not in message


def test_generate_canvas_videos_reads_runtime_video_model_context():
    model_context = AgentModelContext()
    model_context.apply_selection(AgentModelSelection(
        configured_text_model_id="mock-text-model",
        text_model_id="mock-text-model",
        video_model=VideoModelSpec.from_values(
            model_id="mock-video-model",
            video_generation_config={"sizes": [{"value": "mock-video-size"}]},
        ),
    ))
    tool_context = ToolContext()
    tool_context.register_extension("agent_context", type("MockAgentContext", (), {"model_context": model_context})())

    assert GenerateCanvasVideos._resolve_video_model("", tool_context) == "mock-video-model"


def test_generate_canvas_videos_requires_video_model_when_context_has_none():
    model_context = AgentModelContext()
    tool_context = ToolContext()
    tool_context.register_extension("agent_context", type("MockAgentContext", (), {"model_context": model_context})())

    with pytest.raises(ValueError, match="未指定视频模型"):
        GenerateCanvasVideos._resolve_video_model("", tool_context)


@pytest.mark.asyncio
async def test_execute_video_task_carries_error_message_to_result(tmp_path):
    explicit_error = "该提示词包含政治问题 (code=4018, request_id=req-1)"
    tool = GenerateCanvasVideos()
    tool._model_id = "mock-video-model"

    class FakeDesignVideoClient:
        async def generate_video(self, payload):
            raise DesignVideoServiceError(explicit_error, code="4018")

    tool._design_video_client = FakeDesignVideoClient()
    task = VideoTaskSpec(
        prompt="森林中的小路。",
        name="错误信息测试",
        size="1280x720",
    )
    placeholder = ElementDetail(
        id="element-1",
        type="video",
        name="错误信息测试",
        x=0,
        y=0,
        width=1280,
        height=720,
    )

    result = await tool._execute_task_item(
        idx=0,
        task=task,
        placeholder=placeholder,
        tool_context=None,
        project_path=tmp_path,
        project_id="123",
        design_file_dir="/demo/videos/",
    )

    assert not result.success
    assert result.error_message == explicit_error
    assert result.placeholder_update.errorMessage == explicit_error


@pytest.mark.asyncio
async def test_execute_video_task_submits_design_task_without_agent_polling(monkeypatch, tmp_path):
    tool = GenerateCanvasVideos()
    tool._model_id = "mock-video-model"
    submitted_payloads = []

    class FakeDesignVideoClient:
        async def generate_video(self, payload):
            submitted_payloads.append(payload)
            return {
                "project_id": payload["project_id"],
                "video_id": payload["video_id"],
                "status": "running",
            }

    tool._design_video_client = FakeDesignVideoClient()
    monkeypatch.setattr(tool, "_generate_design_video_id", lambda: "video-test-1", raising=False)

    task = VideoTaskSpec(
        prompt="森林中的小路。",
        name="后台托管视频",
        size="1280x720",
        duration_seconds=4,
        resolution="720p",
        seed=7,
    )
    placeholder = ElementDetail(
        id="element-1",
        type="video",
        name="后台托管视频",
        x=0,
        y=0,
        width=1280,
        height=720,
    )

    result = await tool._execute_task_item(
        idx=0,
        task=task,
        placeholder=placeholder,
        tool_context=None,
        project_path=tmp_path,
        project_id="123",
        design_file_dir="/demo-project/videos/",
    )

    assert result.success
    assert result.placeholder_update.status == "processing"
    assert result.placeholder_update.src is None
    assert result.metadata["is_processing"] is True
    assert result.metadata["video_id"] == "video-test-1"
    assert len(submitted_payloads) == 1

    payload = submitted_payloads[0]
    assert payload["project_id"] == "123"
    assert payload["video_id"] == "video-test-1"
    assert payload["model_id"] == "mock-video-model"
    assert payload["prompt"] == "森林中的小路。"
    assert payload["task"] == "generate"
    assert payload["file_dir"] == "/demo-project/videos/"
    assert payload["generation"] == {
        "size": "1280x720",
        "duration_seconds": 4,
        "resolution": "720p",
        "seed": 7,
    }
    assert result.placeholder_update.generateVideoRequest == payload


def test_generate_canvas_videos_initial_placeholder_contains_video_id(monkeypatch):
    tool = GenerateCanvasVideos()
    monkeypatch.setattr(tool, "_generate_design_video_id", lambda: "video-placeholder-1", raising=False)
    task = VideoTaskSpec(
        prompt="森林中的小路。",
        name="占位阶段视频",
        size="1280x720",
    )

    update = tool._build_initial_placeholder_update(task, 0, "element-1")

    assert update["generateVideoRequest"]["video_id"] == "video-placeholder-1"
    assert update["generateVideoRequest"]["prompt"] == "森林中的小路。"
    assert update["generateVideoRequest"]["task"] == "generate"
