from pathlib import Path

import pytest

from app.tools.generate_video import GenerateVideo, GenerateVideoParams
from app.infrastructure.magic_service.config import MagicServiceConfig


VIDEO_CONFIG = {
    "supported_inputs": ["text_prompt", "image", "reference_videos", "reference_audios"],
    "generation": {
        "durations": [5, 10],
        "aspect_ratios": ["16:9"],
        "resolutions": ["768p"],
        "sizes": [{"value": "1366x768", "label": "16:9", "resolution": "768p"}],
        "supports_watermark": True,
    },
    "input_modes": {
        "standard": {"supported_fields": [], "task": "generate"},
        "omni_reference": {
            "supported_fields": ["reference_images", "reference_videos", "reference_audios"],
            "task": "generate",
        },
        "keyframe_guided": {"supported_fields": ["frames"], "task": "generate"},
    },
}


class _ModelContext:
    video_model_id = "MiniMax-H3"

    class video:
        video_generation_config = VIDEO_CONFIG


class _AgentContext:
    model_context = _ModelContext()


class _ToolContext:
    def get_extension(self, name):
        return _AgentContext() if name == "agent_context" else None


def test_prompt_hint_keeps_video_and_audio_requirements():
    hint = GenerateVideo().get_prompt_hint()

    assert "generate_canvas_videos" not in hint
    assert "仅用于通用模式生成普通视频" in hint
    assert "Use only for regular video generation in general mode" in hint
    assert "旁白或对白" in hint
    assert "逐字保留" in hint
    assert all(word in hint for word in ("主体", "动作", "场景", "镜头", "光线", "节奏"))
    assert "用户要求时的音频要求" in hint
    assert "audio requirements when requested" in hint
    assert "do not call generate_images" in GenerateVideo._failure_content("test")
    assert "Generation failed" in GenerateVideo._failure_content("test")
    assert "Failure does not deduct points" in GenerateVideo._failure_content("test")
    assert "必须先调用 ask_user" in hint
    assert "保留原始要求继续尝试" in hint
    assert "风险降低调整" in hint


def test_prompt_hint_is_structured_and_preserves_user_language():
    hint = GenerateVideo().get_prompt_hint()

    assert "**调用时机**" in hint
    assert "**Prompt 写法**" in hint
    assert "**When to call**" in hint
    assert "**Prompt writing**" in hint
    assert "prompt、video_name 使用用户所用的语言" in hint
    assert "output_path" not in hint.split("**语言规则**", 1)[1].split("-->", 1)[0]
    assert "用户所用的语言" in hint
    assert "保留原文" in hint
    assert "same language the user is using" in hint
    assert "complete or detailed prompt" in hint
    assert "crafted prompt" not in hint


def test_video_parameter_descriptions_are_bilingual_and_actionable():
    properties = GenerateVideoParams.model_json_schema()["properties"]

    for field_name in (
        "action",
        "prompt",
        "operation_id",
        "video_name",
        "output_path",
        "input_mode",
        "reference_image_paths",
        "frame_start_path",
        "duration_seconds",
        "size",
    ):
        description = properties[field_name]["description"]
        assert "<!--zh:" in description
        assert "-->" in description
        assert description.rstrip().endswith(".")

    assert "生成时" in properties["prompt"]["description"]
    assert "查询时必填" in properties["operation_id"]["description"]
    assert "用户未明确指定时省略" in properties["input_mode"]["description"]
    assert "通常省略" in properties["output_path"]["description"]
    assert "默认 videos" in properties["output_path"]["description"]
    assert "用户所用的语言" not in properties["output_path"]["description"]


def test_video_api_base_normalizes_existing_version():
    assert GenerateVideo._video_api_base("https://example.com/magic-service/v2/") == "https://example.com/magic-service/v1"


def test_tool_is_only_declared_by_general_agent():
    root = Path(__file__).parents[2]
    assert "- generate_video" in (root / "agents/magic.agent").read_text()
    assert "- generate_video" not in (root / "agents/design.agent").read_text()


def test_design_agent_preloads_canvas_video_guidance():
    root = Path(__file__).parents[2]
    design_source = (root / "agents/design.agent").read_text()
    preload_section = design_source.split("  preload:", 1)[1].split(
        "  system_skills:", 1
    )[0]

    assert "- name: canvas-designer" in preload_section
    assert "- SKILL.md" in preload_section
    assert "- reference/video/generation.md" in preload_section


def test_image_only_request_uses_image_reference_mode():
    config = {
        "input_modes": {
            "standard": {"supported_fields": [], "task": "generate"},
            "image_reference": {
                "supported_fields": ["reference_images"],
                "task": "generate",
            },
        }
    }
    params = GenerateVideoParams(prompt="让图片动起来", reference_image_paths=["image.png"])

    assert GenerateVideo._infer_input_mode(params, config) == "image_reference"


def test_text_request_fails_when_model_has_no_standard_mode():
    config = {
        "input_modes": {
            "image_reference": {
                "supported_fields": ["reference_images"],
                "task": "generate",
            },
        }
    }
    params = GenerateVideoParams(prompt="小猫游泳")

    with pytest.raises(ValueError, match="does not support text-to-video generation"):
        GenerateVideo._infer_input_mode(params, config)


@pytest.mark.parametrize(
    ("parameter", "value", "expected"),
    [
        ("aspect_ratio", "9:16", "Size 1366x768 requires aspect ratio 16:9"),
        ("resolution", "1080p", "Size 1366x768 requires resolution 768p"),
    ],
)
def test_explicit_size_must_match_explicit_generation_parameters(parameter, value, expected):
    config = {
        "generation": {
            "durations": [5],
            "aspect_ratios": ["16:9", "9:16"],
            "resolutions": ["768p", "1080p"],
            "sizes": [
                {"value": "1366x768", "label": "16:9", "resolution": "768p"},
                {"value": "1920x1080", "label": "16:9", "resolution": "1080p"},
            ],
        }
    }
    params = GenerateVideoParams(
        prompt="小猫游泳",
        size="1366x768",
        duration_seconds=5,
        **{parameter: value},
    )

    with pytest.raises(ValueError, match=expected):
        GenerateVideo._build_generation(params, config)


def test_duration_seconds_must_be_positive():
    with pytest.raises(ValueError, match="Duration must be greater than 0"):
        GenerateVideoParams(prompt="小猫游泳", duration_seconds=0)


def test_real_agent_string_arguments_are_normalized():
    params = GenerateVideoParams(
        prompt="小猫游泳",
        model_id="minimax-h3",
        input_mode="text_to_video",
        task="text_to_video",
        duration_seconds="5",
        fps="30",
        seed="",
        watermark="None",
    )

    assert params.input_mode == "standard"
    assert params.task == "generate"
    assert params.duration_seconds == 5
    assert params.fps == 30
    assert params.seed is None
    assert params.watermark is None


def test_model_id_match_is_case_insensitive_and_keeps_context_config():
    model_id, config = GenerateVideo._resolve_model_config(_ToolContext(), "minimax-h3")

    assert model_id == "MiniMax-H3"
    assert config is VIDEO_CONFIG


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status", "content_type", "body", "expected"),
    [
        (200, "application/json", "", "Video API returned an empty response"),
        (200, "text/plain", "upstream unavailable", "Video API returned invalid JSON"),
        (502, "text/html", "<html>bad gateway</html>", "HTTP 502"),
    ],
)
async def test_request_json_reports_response_boundary_errors(
    monkeypatch, tmp_path, status, content_type, body, expected
):
    tool = GenerateVideo(base_dir=tmp_path)
    tool._config = MagicServiceConfig(api_base_url="https://magic.example")
    monkeypatch.setattr(
        "app.tools.generate_video.aiohttp.ClientSession",
        lambda: _JsonSession(status, content_type, body),
    )

    with pytest.raises(ValueError, match=expected):
        await tool._request_json("GET", "/videos/op-1")


@pytest.mark.asyncio
async def test_request_json_accepts_normal_json(monkeypatch, tmp_path):
    tool = GenerateVideo(base_dir=tmp_path)
    tool._config = MagicServiceConfig(api_base_url="https://magic.example")
    monkeypatch.setattr(
        "app.tools.generate_video.aiohttp.ClientSession",
        lambda: _JsonSession(200, "application/json", '{"id":"op-1","status":"queued"}'),
    )

    assert await tool._request_json("GET", "/videos/op-1") == {"id": "op-1", "status": "queued"}


@pytest.mark.asyncio
async def test_request_json_uses_chinese_message_for_invalid_json(monkeypatch, tmp_path):
    tool = GenerateVideo(base_dir=tmp_path)
    tool._config = MagicServiceConfig(api_base_url="https://magic.example")
    monkeypatch.setattr(
        "app.tools.generate_video.aiohttp.ClientSession",
        lambda: _JsonSession(200, "text/plain", "upstream unavailable"),
    )

    with pytest.raises(ValueError, match="Video API returned invalid JSON"):
        await tool._request_json("GET", "/videos/op-1")


@pytest.mark.asyncio
async def test_generate_builds_request_and_downloads_succeeded_video(monkeypatch, tmp_path):
    tool = GenerateVideo(base_dir=tmp_path)
    requests = []

    async def fake_request(method, path, payload=None, request_id=""):
        requests.append((method, path, payload))
        if method == "POST":
            return {"id": "op-1", "status": "queued"}
        return {"id": "op-1", "status": "succeeded", "output": {"video_url": "https://cdn/video.mp4"}}

    async def fake_download(_tool_context, url, output_path, video_name, override):
        assert url == "https://cdn/video.mp4"
        return str(tmp_path / output_path / f"{video_name}.mp4"), f"{output_path}/{video_name}.mp4"

    monkeypatch.setattr(tool, "_request_json", fake_request)
    monkeypatch.setattr(tool, "_download_video", fake_download)
    monkeypatch.setattr(tool, "_business_params", lambda: {})
    monkeypatch.setattr("app.tools.generate_video.asyncio.sleep", lambda _: _completed())

    result = await tool.execute_purely(
        _ToolContext(),
        GenerateVideoParams(
            prompt="小猫游泳，中文旁白：出发吧",
            duration_seconds=5,
            aspect_ratio="16:9",
            video_name="cat",
            poll_interval_seconds=1,
        ),
    )

    assert result.ok is True
    assert result.videos == [str(tmp_path / "videos/cat.mp4")]
    assert result.video_url == str(tmp_path / "videos/cat.mp4")
    assert requests[0] == (
        "POST",
        "/videos",
        {
            "model_id": "MiniMax-H3",
            "task": "generate",
            "prompt": "小猫游泳，中文旁白：出发吧",
            "input_mode": "standard",
            "generation": {
                "aspect_ratio": "16:9",
                "duration_seconds": 5,
                "resolution": "768p",
                "size": "1366x768",
            },
        },
    )
    assert requests[1][:2] == ("GET", "/videos/op-1")


@pytest.mark.asyncio
async def test_query_existing_operation_does_not_create_new_task(monkeypatch, tmp_path):
    tool = GenerateVideo(base_dir=tmp_path)
    requests = []

    async def fake_request(method, path, payload=None, request_id=""):
        requests.append((method, path, payload))
        return {"id": "op-existing", "status": "failed", "error": {"message": "blocked"}}

    monkeypatch.setattr(tool, "_request_json", fake_request)

    result = await tool.execute_purely(
        None,
        GenerateVideoParams(action="query", operation_id="op-existing"),
    )

    assert result.ok is False
    assert result.extra_info["operation_id"] == "op-existing"
    assert "blocked" in result.content
    assert requests == [("GET", "/videos/op-existing", None)]


@pytest.mark.asyncio
async def test_generate_timeout_returns_operation_id(monkeypatch, tmp_path):
    tool = GenerateVideo(base_dir=tmp_path)

    async def fake_request(method, path, payload=None, request_id=""):
        return {"id": "op-timeout", "status": "processing"}

    monkeypatch.setattr(tool, "_request_json", fake_request)
    monkeypatch.setattr("app.tools.generate_video.asyncio.sleep", lambda _: _completed())

    result = await tool.execute_purely(
        _ToolContext(),
        GenerateVideoParams(
            prompt="海边日落",
            poll_interval_seconds=1,
            poll_timeout_seconds=1,
        ),
    )

    assert result.ok is True
    assert result.extra_info == {
        "operation_id": "op-timeout",
        "status": "processing",
        "timed_out": True,
    }


@pytest.mark.asyncio
async def test_payload_includes_all_supported_inputs_and_generation_fields(monkeypatch, tmp_path):
    tool = GenerateVideo(base_dir=tmp_path)
    monkeypatch.setattr(tool, "_resolve_input_uri", _identity_uri)

    payload = await tool._build_payload(
        _ToolContext(),
        GenerateVideoParams(
            prompt="产品视频",
            task="generate",
            input_mode="omni_reference",
            reference_image_paths=["image.png"],
            reference_video_paths=["video.mp4"],
            reference_audio_paths=["audio.mp3"],
            size="1366x768",
            duration_seconds=5,
            aspect_ratio="16:9",
            resolution="768p",
            fps=24,
            seed=7,
            watermark=True,
        ),
    )

    assert payload["inputs"] == {
        "reference_images": [{"uri": "image.png"}],
        "reference_videos": [{"uri": "video.mp4"}],
        "reference_audios": [{"uri": "audio.mp3"}],
    }
    assert payload["generation"] == {
        "size": "1366x768",
        "duration_seconds": 5,
        "aspect_ratio": "16:9",
        "resolution": "768p",
        "fps": 24,
        "seed": 7,
        "watermark": True,
    }


@pytest.mark.asyncio
async def test_missing_model_fails_explicitly(tmp_path):
    result = await GenerateVideo(base_dir=tmp_path).execute_purely(
        None,
        GenerateVideoParams(prompt="小猫游泳", poll_timeout_seconds=0),
    )

    assert result.ok is False
    assert "No video model is available" in result.content


@pytest.mark.asyncio
async def test_poll_error_preserves_operation_id(monkeypatch, tmp_path):
    tool = GenerateVideo(base_dir=tmp_path)

    async def fake_request(method, path, payload=None, request_id=""):
        if method == "POST":
            return {"id": "op-error", "status": "processing"}
        raise RuntimeError("poll failed")

    monkeypatch.setattr(tool, "_request_json", fake_request)
    monkeypatch.setattr(tool, "_business_params", lambda: {})
    monkeypatch.setattr("app.tools.generate_video.asyncio.sleep", lambda _: _completed())

    result = await tool.execute_purely(
        _ToolContext(),
        GenerateVideoParams(prompt="小猫游泳", poll_interval_seconds=1),
    )

    assert result.ok is False
    assert result.extra_info["operation_id"] == "op-error"


@pytest.mark.asyncio
@pytest.mark.parametrize("chunks", [[b"12", RuntimeError("interrupted")], [b"12345"]])
async def test_download_failure_leaves_no_target_or_temp(monkeypatch, tmp_path, chunks):
    tool = GenerateVideo(base_dir=tmp_path)
    monkeypatch.setattr("app.tools.generate_video.aiohttp.ClientSession", lambda: _FakeSession(chunks))
    monkeypatch.setattr("app.tools.generate_video.MAX_DOWNLOAD_BYTES", 4)

    with pytest.raises((RuntimeError, ValueError)):
        await tool._download_video(None, "https://cdn/video.mp4", "videos", "broken", False)

    output = tmp_path / "videos"
    assert not (output / "broken.mp4").exists()
    assert list(output.glob("*.part")) == []


async def _identity_uri(value):
    return value


class _FakeContent:
    def __init__(self, chunks):
        self.chunks = chunks

    async def iter_chunked(self, _size):
        for chunk in self.chunks:
            if isinstance(chunk, Exception):
                raise chunk
            yield chunk


class _FakeResponse:
    status = 200

    def __init__(self, chunks):
        self.content = _FakeContent(chunks)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False


class _FakeSession:
    def __init__(self, chunks):
        self.chunks = chunks

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False

    def get(self, *_args, **_kwargs):
        return _FakeResponse(self.chunks)


class _JsonResponse:
    def __init__(self, status, content_type, body):
        self.status = status
        self.headers = {"Content-Type": content_type}
        self.body = body

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False

    async def text(self):
        return self.body


class _JsonSession:
    def __init__(self, status, content_type, body):
        self.response = _JsonResponse(status, content_type, body)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False

    def request(self, *_args, **_kwargs):
        return self.response


async def _completed():
    return None
