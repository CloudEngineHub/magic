import pytest
from pydantic import ValidationError

from agentlang.context.tool_context import ToolContext
from app.core.models.agent_model_context import AgentModelContext
from app.core.models.agent_model_selection import AgentModelSelection
from app.core.models.media_model import VideoModelSpec
from app.infrastructure.magic_service.config import MagicServiceConfig
from app.infrastructure.magic_service.client import MagicServiceClient
from app.infrastructure.magic_service.exceptions import ApiError
from app.tools.design.tools.generate_canvas_videos import (
    GenerateCanvasVideos,
    GenerateCanvasVideosParams,
    VideoPlaceholderUpdate,
    VideoTaskSpec,
)
from app.tools.design.tools.base_generate_canvas_elements import ElementDetail, TaskExecutionResult


class _FakeMagicServiceResponse:
    def __init__(self, payload, status=200):
        self.payload = payload
        self.status = status

    async def text(self):
        import json

        return json.dumps(self.payload)

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False


class _FakeMagicServiceSession:
    def __init__(self, response):
        self.response = response
        self.requests = []

    def request(self, method, url, json=None, headers=None, params=None):
        self.requests.append({
            "method": method,
            "url": url,
            "json": json,
            "headers": headers or {},
            "params": params,
        })
        return self.response


@pytest.mark.asyncio
async def test_magic_service_client_generate_design_video_forwards_user_auth_and_metadata(monkeypatch):
    metadata = {
        "organization_code": "test-org",
    }

    monkeypatch.setattr(
        "app.infrastructure.magic_service.client.MetadataUtil.add_magic_and_user_authorization_headers",
        lambda headers: headers.update({"User-Authorization": "test-user-token"}),
    )
    monkeypatch.setattr(
        "app.infrastructure.magic_service.client.MetadataUtil.get_llm_request_headers",
        lambda: {"Magic-Task-Id": "task-1"},
    )
    monkeypatch.setattr(
        "app.infrastructure.magic_service.client.MetadataUtil.get_metadata",
        lambda: metadata,
    )

    client = MagicServiceClient(config=MagicServiceConfig(api_base_url="http://magic-service.test"))
    client.session = _FakeMagicServiceSession(
        _FakeMagicServiceResponse({"code": 1000, "data": {"video_id": "vid-1"}})
    )

    result = await client.generate_design_video({"video_id": "vid-1"})

    assert result == {"video_id": "vid-1"}
    request = client.session.requests[0]
    assert request["method"] == "POST"
    assert request["url"] == "http://magic-service.test/api/v1/design/generate-video"
    assert request["json"] == {"video_id": "vid-1"}

    headers = request["headers"]
    assert headers["User-Authorization"] == "test-user-token"
    assert headers["organization-code"] == "test-org"
    assert headers["Magic-Task-Id"] == "task-1"


@pytest.mark.asyncio
async def test_magic_service_client_estimate_design_video_points_uses_estimate_endpoint():
    class RecordingMagicServiceClient(MagicServiceClient):
        def __init__(self):
            self.requests = []

        async def _request_json(
            self,
            method,
            path,
            payload=None,
            operation_name="Magic Service API",
            params=None,
        ):
            self.requests.append(
                {
                    "method": method,
                    "path": path,
                    "payload": payload,
                    "operation_name": operation_name,
                }
            )
            return {"points": 12}

    client = RecordingMagicServiceClient()
    payload = {
        "project_id": "project-1",
        "model_id": "MiniMax-H3",
        "generation": {"duration_seconds": 5, "resolution": "768p"},
    }

    result = await client.estimate_design_video_points(payload)

    assert result == {"points": 12}
    assert client.requests == [
        {
            "method": "POST",
            "path": "/api/v1/design/estimate-video-points",
            "payload": payload,
            "operation_name": "设计视频积分预估",
        }
    ]


@pytest.mark.asyncio
async def test_magic_service_client_uses_existing_parent_id_for_duplicate_directory():
    class RecordingMagicServiceClient(MagicServiceClient):
        def __init__(self):
            self.requests = []
            self.responses = [
                {"file_id": "existing-project-dir"},
                {"file_id": "videos-dir"},
            ]

        async def _request_json(
            self,
            method,
            path,
            payload=None,
            operation_name="Magic Service API",
            params=None,
        ):
            self.requests.append((method, path, payload, operation_name))
            return self.responses.pop(0)

    client = RecordingMagicServiceClient()

    parent_id = await client.ensure_project_directories(
        project_id="project-1",
        directory_parts=["demo-project", "videos"],
    )

    assert parent_id == "videos-dir"
    assert client.requests == [
        (
            "POST",
            "/api/v1/super-agent/file",
            {
                "project_id": "project-1",
                "parent_id": "",
                "file_name": "demo-project",
                "is_directory": True,
                "ignore_duplicate": True,
                "pre_file_id": -1,
            },
            "创建项目目录",
        ),
        (
            "POST",
            "/api/v1/super-agent/file",
            {
                "project_id": "project-1",
                "parent_id": "existing-project-dir",
                "file_name": "videos",
                "is_directory": True,
                "ignore_duplicate": True,
                "pre_file_id": -1,
            },
            "创建项目目录",
        ),
    ]


@pytest.mark.asyncio
async def test_magic_service_client_estimate_design_video_points_forwards_auth_headers(monkeypatch):
    monkeypatch.setattr(
        "app.infrastructure.magic_service.client.MetadataUtil.add_magic_and_user_authorization_headers",
        lambda headers: headers.update({"User-Authorization": "test-user-token"}),
    )
    monkeypatch.setattr(
        "app.infrastructure.magic_service.client.MetadataUtil.get_llm_request_headers",
        lambda: {"Magic-Task-Id": "task-1"},
    )
    monkeypatch.setattr(
        "app.infrastructure.magic_service.client.MetadataUtil.get_metadata",
        lambda: {"organization_code": "test-org"},
    )

    client = MagicServiceClient(config=MagicServiceConfig(api_base_url="http://magic-service.test"))
    client.session = _FakeMagicServiceSession(
        _FakeMagicServiceResponse({"code": 1000, "data": {"points": 12}})
    )

    result = await client.estimate_design_video_points({"project_id": "123"})

    assert result == {"points": 12}
    request = client.session.requests[0]
    assert request["method"] == "POST"
    assert request["url"] == "http://magic-service.test/api/v1/design/estimate-video-points"
    assert request["json"] == {"project_id": "123"}
    assert request["headers"]["User-Authorization"] == "test-user-token"
    assert request["headers"]["organization-code"] == "test-org"
    assert request["headers"]["Magic-Task-Id"] == "task-1"


def test_video_task_spec_normalizes_input_mode_aliases_from_llm():
    task = VideoTaskSpec(
        prompt="把参考视频改成水彩风格",
        name="水彩视频编辑",
        aspect_ratio="16:9",
        duration_seconds=4,
        resolution="720p",
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
            aspect_ratio="16:9",
            duration_seconds=4,
            resolution="720p",
            reference_image_paths=["images/white-cat.jpg", "images/black-cat.jpg"],
        )


def test_video_task_spec_allows_reference_image_tokens():
    task = VideoTaskSpec(
        prompt="白色小猫 [image1] 从黑色箱子探头，黑色小猫 [image2] 从白色箱子跳出",
        name="箱子跳猫",
        aspect_ratio="16:9",
        duration_seconds=4,
        resolution="720p",
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
        aspect_ratio="16:9",
        duration_seconds=4,
        resolution="720p",
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
            aspect_ratio="16:9",
            duration_seconds=4,
            resolution="720p",
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
                    aspect_ratio="16:9",
                    duration_seconds=4,
                    resolution="720p",
                )
            ],
        ),
    )

    assert not result.ok
    assert "缺少 project_id" in result.content
    assert "雨夜电车橘猫" not in project_file.read_text(encoding="utf-8")


@pytest.mark.asyncio
async def test_generate_canvas_videos_prepare_registers_remote_videos_directory(
    monkeypatch,
    tmp_path,
):
    project_dir = tmp_path / "group" / "subproject"
    (project_dir / "videos").mkdir(parents=True)
    registrations = []

    class FakeMagicServiceClient:
        async def ensure_project_directories(self, project_id, directory_parts):
            registrations.append((project_id, directory_parts))
            return "videos-dir-id"

    tool = GenerateCanvasVideos(base_dir=str(tmp_path))
    tool._magic_service_client = FakeMagicServiceClient()
    monkeypatch.setattr(tool, "_resolve_project_id", lambda: "project-1")

    kwargs = await tool._prepare_task_kwargs(ToolContext(), project_dir)

    assert registrations == [("project-1", ["group", "subproject", "videos"])]
    assert kwargs["design_file_dir"] == "/group/subproject/videos/"
    assert (project_dir / "videos").is_dir()


@pytest.mark.asyncio
async def test_generate_canvas_videos_prepare_rejects_parent_traversal(
    monkeypatch,
    tmp_path,
):
    registrations = []

    class FakeMagicServiceClient:
        async def ensure_project_directories(self, project_id, directory_parts):
            registrations.append((project_id, directory_parts))

    tool = GenerateCanvasVideos(base_dir=str(tmp_path))
    tool._magic_service_client = FakeMagicServiceClient()
    monkeypatch.setattr(tool, "_resolve_project_id", lambda: "project-1")

    with pytest.raises(ValueError, match="不安全"):
        await tool._prepare_task_kwargs(
            ToolContext(),
            tmp_path / "group" / ".." / "outside",
        )

    assert registrations == []


def test_generate_canvas_videos_params_uses_resolution_and_aspect_ratio_for_canvas_dimensions():
    params = GenerateCanvasVideosParams(
        project_path="demo-project",
        tasks=[
            {
                "prompt": "生成一个 16:9 的 720p 广告短片",
                "name": "广告短片",
                "aspect_ratio": "16:9",
                "duration_seconds": 4,
                "resolution": "720p",
            }
        ],
    )

    assert params.tasks[0].canvas_dimensions == (1280, 720)
    assert "width" not in params.tasks[0].model_fields_set
    assert "height" not in params.tasks[0].model_fields_set


@pytest.mark.parametrize(
        ("resolution", "aspect_ratio", "expected_dimensions"),
        [
            ("1080p", "9:16", (1080, 1920)),
            ("2k", "16:9", (2560, 1440)),
            ("4k", "16:9", (3840, 2160)),
            ("8k", "16:9", (7680, 4320)),
            ("720p", "1:1", (960, 960)),
    ],
)
def test_generate_canvas_videos_params_derives_canvas_dimensions_without_size(
    resolution,
    aspect_ratio,
    expected_dimensions,
):
    params = GenerateCanvasVideosParams(
        project_path="demo-project",
        tasks=[
            {
                "prompt": "生成一个视频",
                "name": "动态尺寸视频",
                "aspect_ratio": aspect_ratio,
                "duration_seconds": 4,
                "resolution": resolution,
            }
        ],
    )

    assert params.tasks[0].canvas_dimensions == expected_dimensions


def test_generate_canvas_videos_params_ignores_legacy_canvas_dimensions():
    params = GenerateCanvasVideosParams(
        project_path="demo-project",
        tasks=[
            {
                "prompt": "生成一个 16:9 的 720p 广告短片",
                "name": "广告短片",
                "aspect_ratio": "16:9",
                "duration_seconds": 4,
                "resolution": "720p",
                "width": 640,
                "height": 360,
            }
        ],
    )

    assert params.tasks[0].canvas_dimensions == (1280, 720)


def test_generate_canvas_videos_params_allow_omitting_generation_fields():
    params = GenerateCanvasVideosParams(
        project_path="demo-project",
        tasks=[
            {
                "prompt": "生成一个广告短片",
                "name": "广告短片",
            }
        ],
    )

    task = params.tasks[0]
    assert task.aspect_ratio is None
    assert task.duration_seconds is None
    assert task.resolution is None
    assert task.canvas_dimensions == (1280, 720)


def test_generate_canvas_videos_builds_generation_without_layout_defaults():
    task = VideoTaskSpec(
        prompt="森林中的小路。",
        name="默认参数视频",
    )

    generation = GenerateCanvasVideos._build_design_generation(task)

    assert generation == {}


def test_generate_canvas_videos_params_rejects_size():
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
    assert "size" in message
    assert "Extra inputs are not permitted" in message


def test_generate_canvas_videos_params_do_not_expose_unused_override():
    assert "override" not in GenerateCanvasVideosParams.model_fields


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

    class FakeMagicServiceClient:
        async def generate_design_video(self, payload):
            raise ApiError(explicit_error)

    tool._magic_service_client = FakeMagicServiceClient()
    task = VideoTaskSpec(
        prompt="森林中的小路。",
        name="错误信息测试",
        aspect_ratio="16:9",
        duration_seconds=4,
        resolution="720p",
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

    class FakeMagicServiceClient:
        async def generate_design_video(self, payload):
            submitted_payloads.append(payload)
            return {
                "project_id": payload["project_id"],
                "video_id": payload["video_id"],
                "status": "running",
            }

    tool._magic_service_client = FakeMagicServiceClient()
    monkeypatch.setattr(tool, "_generate_design_video_id", lambda: "video-test-1", raising=False)

    task = VideoTaskSpec(
        prompt="森林中的小路。",
        name="后台托管视频",
        aspect_ratio="16:9",
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
    assert payload["inputs"] == {
        "reference_images": [],
        "reference_videos": [],
        "reference_audios": [],
        "frames": [],
    }
    assert payload["generation"] == {
        "aspect_ratio": "16:9",
        "duration_seconds": 4,
        "resolution": "720p",
        "seed": 7,
    }
    assert result.placeholder_update.generateVideoRequest == payload


def test_generate_canvas_videos_extra_info_uses_video_names():
    tool = GenerateCanvasVideos()
    extra_info = tool._collect_extra_info(
        tasks=[],
        placeholders=[],
        task_results=[
            TaskExecutionResult(
                index=0,
                success=True,
                placeholder_update=VideoPlaceholderUpdate(status="processing"),
                metadata={
                    "is_processing": True,
                    "element_id": "element-1",
                    "element_name": "后台托管视频",
                    "video_id": "video-test-1",
                    "pending_status": "running",
                },
            )
        ],
    )

    assert extra_info["pending_videos"] == [
        {
            "element_id": "element-1",
            "element_name": "后台托管视频",
            "video_id": "video-test-1",
            "status": "running",
        }
    ]
    assert "pending_operations" not in extra_info


def test_generate_canvas_videos_initial_placeholder_contains_video_id(monkeypatch):
    tool = GenerateCanvasVideos()
    monkeypatch.setattr(tool, "_generate_design_video_id", lambda: "video-placeholder-1", raising=False)
    task = VideoTaskSpec(
        prompt="森林中的小路。",
        name="占位阶段视频",
        aspect_ratio="16:9",
        duration_seconds=4,
        resolution="720p",
    )

    update = tool._build_initial_placeholder_update(task, 0, "element-1")

    assert update["generateVideoRequest"]["video_id"] == "video-placeholder-1"
    assert update["generateVideoRequest"]["prompt"] == "森林中的小路。"
    assert update["generateVideoRequest"]["task"] == "generate"
    assert update["generateVideoRequest"]["inputs"] == {
        "reference_images": [],
        "reference_videos": [],
        "reference_audios": [],
        "frames": [],
    }


def test_generate_canvas_videos_initial_placeholder_infers_omni_reference(monkeypatch):
    tool = GenerateCanvasVideos()
    monkeypatch.setattr(tool, "_generate_design_video_id", lambda: "video-placeholder-1", raising=False)
    task = VideoTaskSpec(
        prompt="参考图片 [image1] 生成小猫游泳视频。",
        name="参考图小猫游泳",
        reference_image_paths=["cat-swimming-video/images/cat.png"],
    )

    update = tool._build_initial_placeholder_update(task, 0, "element-1")

    assert update["generateVideoRequest"]["input_mode"] == "omni_reference"
    assert update["generateVideoRequest"]["inputs"] == {
        "reference_images": [{"uri": "/cat-swimming-video/images/cat.png"}],
        "reference_videos": [],
        "reference_audios": [],
        "frames": [],
    }


def test_generate_canvas_videos_request_infers_omni_reference_for_references():
    tool = GenerateCanvasVideos()
    task = VideoTaskSpec(
        prompt="参考图片 [image1] 和视频 [video1] 生成小猫游泳视频。",
        name="参考素材小猫游泳",
        reference_image_paths=["cat-swimming-video/images/cat.png"],
        reference_video_paths=["cat-swimming-video/videos/motion.mp4"],
    )

    payload = tool._build_design_video_request(
        task=task,
        project_id="123",
        video_id="video-test-1",
        model_id="mock-video-model",
        file_dir="/cat-swimming-video/videos/",
        relative_project_path="cat-swimming-video",
    )

    assert payload["input_mode"] == "omni_reference"
    assert payload["inputs"] == {
        "reference_images": [{"uri": "/cat-swimming-video/images/cat.png"}],
        "reference_videos": [{"uri": "/cat-swimming-video/videos/motion.mp4"}],
        "reference_audios": [],
        "frames": [],
    }


def test_generate_canvas_videos_builds_shared_task_request_fields_once():
    tool = GenerateCanvasVideos()
    task = VideoTaskSpec(
        prompt="参考图片 [image1] 生成小猫游泳视频。",
        name="共享请求字段",
        reference_image_paths=["demo/images/cat.png"],
        duration_seconds=6,
        resolution="1080p",
        seed=9,
        extensions={"provider_option": "value"},
    )

    fields = tool._build_design_video_task_fields(
        task,
        relative_project_path="demo",
    )

    assert fields == {
        "prompt": "参考图片 [image1] 生成小猫游泳视频。",
        "input_mode": "omni_reference",
        "task": "generate",
        "inputs": {
            "reference_images": [{"uri": "/demo/images/cat.png"}],
            "reference_videos": [],
            "reference_audios": [],
            "frames": [],
        },
        "generation": {
            "duration_seconds": 6,
            "resolution": "1080p",
            "seed": 9,
        },
        "extensions": {"provider_option": "value"},
    }


def test_generate_canvas_videos_initial_and_common_requests_keep_exact_structure():
    tool = GenerateCanvasVideos()
    tool._model_id = "requested-model"
    task = VideoTaskSpec(
        prompt="把参考视频 [video1] 改成水彩风格。",
        name="结构等价",
        input_mode="video_edit",
        task="edit",
        reference_video_paths=["demo/videos/source.mp4"],
        aspect_ratio="9:16",
        fps=24,
        watermark=False,
        extensions={"provider_option": "value"},
    )

    initial = tool._build_initial_design_video_request(task, "video-1")
    common = tool._build_common_design_video_request(
        task=task,
        project_id="project-1",
        model_id="resolved-model",
        relative_project_path="demo",
    )

    assert initial == {
        "video_id": "video-1",
        "model_id": "requested-model",
        "prompt": "把参考视频 [video1] 改成水彩风格。",
        "input_mode": "video_edit",
        "task": "edit",
        "generation": {"aspect_ratio": "9:16", "fps": 24, "watermark": False},
        "inputs": {
            "reference_images": [],
            "reference_videos": [{"uri": "/demo/videos/source.mp4"}],
            "reference_audios": [],
            "frames": [],
        },
        "extensions": {"provider_option": "value"},
    }
    assert common == {
        "project_id": "project-1",
        "model_id": "resolved-model",
        "prompt": "把参考视频 [video1] 改成水彩风格。",
        "input_mode": "video_edit",
        "task": "edit",
        "inputs": {
            "reference_images": [],
            "reference_videos": [{"uri": "/demo/videos/source.mp4"}],
            "reference_audios": [],
            "frames": [],
        },
        "generation": {"aspect_ratio": "9:16", "fps": 24, "watermark": False},
        "extensions": {"provider_option": "value"},
    }
