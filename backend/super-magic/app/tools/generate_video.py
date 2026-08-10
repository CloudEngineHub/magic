"""通用模式视频生成工具。

画布视频由 ``generate_canvas_videos`` 负责；本工具只负责创建和查询普通视频任务。
"""

from __future__ import annotations

import asyncio
import json
import re
import uuid
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional
from urllib.parse import urlparse

import aiofiles
import aiohttp
from pydantic import Field, field_validator, model_validator

from agentlang.context.tool_context import ToolContext
from agentlang.path_manager import PathManager
from agentlang.utils.file import generate_safe_filename
from agentlang.utils.metadata import MetadataUtil
from app.core.entity.tool.tool_result import VideoToolResult
from app.infrastructure.magic_service.config import MagicServiceConfig, MagicServiceConfigLoader
from app.tools.abstract_file_tool import AbstractFileTool
from app.tools.core import BaseToolParams, tool
from app.tools.media_utils.presigned_url import generate_presigned_url
from app.tools.workspace_tool import WorkspaceTool
from app.utils.async_file_utils import async_exists, async_mkdir, async_replace, async_unlink

DEFAULT_OUTPUT_PATH = "videos"
TERMINAL_STATUSES = {"succeeded", "failed", "canceled"}
MAX_DOWNLOAD_BYTES = 500 * 1024 * 1024


class GenerateVideoParams(BaseToolParams):
    action: Literal["generate", "query"] = Field("generate", description="创建或查询视频任务")
    prompt: str = Field("", description="视频生成提示词")
    model_id: str = Field("", description="视频模型 ID；用户未明确指定时省略，使用当前会话模型")
    operation_id: str = Field("", description="查询已有任务时使用的 operation ID")
    video_name: str = Field("", description="输出文件名（不含扩展名）")
    output_path: str = Field(DEFAULT_OUTPUT_PATH, description="相对工作区的输出目录")
    input_mode: str = Field("", description="输入模式；用户未明确指定时省略，由工具按素材选择")
    task: str = Field("generate", description="视频任务类型；用户未明确指定时省略")
    reference_image_paths: List[str] = Field(default_factory=list, description="参考图片工作区路径或 URL")
    reference_video_paths: List[str] = Field(default_factory=list, description="参考视频工作区路径或 URL")
    reference_audio_paths: List[str] = Field(default_factory=list, description="参考音频工作区路径或 URL")
    frame_start_path: str = Field("", description="首帧工作区路径或 URL")
    frame_end_path: str = Field("", description="尾帧工作区路径或 URL")
    size: str = Field("", description="模型支持的视频尺寸；用户未明确指定时省略，由工具选择")
    duration_seconds: Optional[int] = Field(None, description="视频时长（秒）")
    aspect_ratio: str = Field("", description="视频比例，例如 16:9")
    resolution: str = Field("", description="视频分辨率；用户未明确指定时省略")
    fps: Optional[int] = Field(None, description="帧率；用户未明确指定时省略")
    seed: Optional[int] = Field(None, description="随机种子；用户未明确指定时省略")
    watermark: Optional[bool] = Field(None, description="水印；用户未明确指定时省略")
    extensions: Dict[str, Any] = Field(default_factory=dict, description="透传扩展配置")
    override: bool = Field(False, description="是否覆盖同名文件")
    poll_interval_seconds: float = Field(5, gt=0, description="轮询间隔")
    poll_timeout_seconds: float = Field(300, ge=0, description="轮询超时")

    @model_validator(mode="before")
    @classmethod
    def normalize_aliases(cls, values: Any) -> Any:
        if not isinstance(values, dict):
            return values
        normalized = dict(values)
        task = str(normalized.get("task") or "").strip().lower()
        if task in {"text_to_video", "image_to_video"}:
            normalized["task"] = "generate"
        mode = str(normalized.get("input_mode") or "").strip().lower()
        if mode == "text_to_video":
            normalized["input_mode"] = "standard"
        elif mode == "image_to_video":
            normalized["input_mode"] = ""
        return normalized

    @field_validator("duration_seconds", "fps", "seed", mode="before")
    @classmethod
    def normalize_optional_int(cls, value: Any) -> Any:
        if value is None or (isinstance(value, str) and value.strip().lower() in {"", "none", "null"}):
            return None
        if isinstance(value, str):
            try:
                return int(value.strip())
            except ValueError as exc:
                raise ValueError(f"Value must be an integer: {value}") from exc
        return value

    @field_validator("duration_seconds")
    @classmethod
    def validate_duration_seconds(cls, value: Optional[int]) -> Optional[int]:
        if value is not None and value <= 0:
            raise ValueError("Duration must be greater than 0")
        return value

    @field_validator("watermark", mode="before")
    @classmethod
    def normalize_optional_bool(cls, value: Any) -> Any:
        if value is None or (isinstance(value, str) and value.strip().lower() in {"", "none", "null"}):
            return None
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"true", "1"}:
                return True
            if normalized in {"false", "0"}:
                return False
            raise ValueError(f"Value must be true or false: {value}")
        return value

    @model_validator(mode="after")
    def validate_action_fields(self):
        if self.action == "generate" and not self.prompt.strip():
            raise ValueError("The generate action requires prompt")
        if self.action == "query" and not self.operation_id.strip():
            raise ValueError("The query action requires operation_id")
        return self


@tool(name="generate_video")
class GenerateVideo(AbstractFileTool[GenerateVideoParams], WorkspaceTool[GenerateVideoParams]):
    """通用模式生成视频并保存到工作区。"""

    def __init__(self, **data: Any):
        data.setdefault("base_dir", PathManager.get_workspace_dir())
        super().__init__(**data)
        self._config: Optional[MagicServiceConfig] = None

    def get_prompt_hint(self) -> str:
        return """<!--zh
调用时机：通用模式生成普通视频；画布设计请求使用 generate_canvas_videos。
将模糊需求整理为清晰提示词，至少包含主体、动作、场景、镜头、光线、风格、节奏和音频。
用户要求旁白或对白、配音、音乐、音效时，必须在最终 prompt 中逐字保留相关内容，并注明说话人、语言、声音特征和出现时间。
用户未明确指定时，省略 model_id、input_mode、task、size、resolution、fps、seed、watermark，由工具按当前模型选择。
默认生成前等待用户确认；用户明确要求直接生成或跳过确认时可直接生成。涉及 IP、真人、色情、政治、暴力等风险内容，或需要向用户提供多个方向选择时，必须先调用 ask_user，再根据用户选择继续；至少提供“保留原始要求继续尝试”和“风险降低调整”两个选项，不得先用普通文本代替 ask_user，也不得强制改写。
生成失败不得改用生图或其他工具替代，也不自动重试。
-->
Use this tool to generate regular videos in general mode; use `generate_canvas_videos` for canvas design requests.
Turn vague requests into clear prompts containing at least the subject, action, scene, camera, lighting, style, pacing, and audio.
When the user requests narration, dialogue, voice-over, music, or sound effects, preserve the requested content verbatim in the final prompt and specify the speaker, language, voice characteristics, and timing.
Unless explicitly specified by the user, omit `model_id`, `input_mode`, `task`, `size`, `resolution`, `fps`, `seed`, and `watermark`, allowing the tool to choose based on the current model.
By default, wait for user confirmation before generation. Generate immediately only when the user explicitly requests direct generation or asks to skip confirmation. For risks involving IP, real people, sexual content, politics, violence, or any situation requiring multiple choices, call `ask_user` first and proceed according to the user's selection. Provide at least two options: keep the original request and attempt it as written, or apply a risk-reducing adjustment. Do not replace `ask_user` with plain text or force a rewrite.
If generation fails, do not substitute image generation or another tool, and do not retry automatically.
"""

    async def execute(self, tool_context: ToolContext, params: GenerateVideoParams) -> VideoToolResult:
        return await self.execute_purely(tool_context, params)

    async def execute_purely(self, tool_context: ToolContext, params: GenerateVideoParams) -> VideoToolResult:
        try:
            operation_id = params.operation_id.strip()
            request_id = str(uuid.uuid4())
            if params.action == "query":
                if not operation_id:
                    raise ValueError("The query action requires operation_id")
                operation = await self._request_json(
                    "GET", f"/videos/{operation_id}", request_id=request_id
                )
            else:
                payload = await self._build_payload(tool_context, params)
                created = await self._request_json(
                    "POST", "/videos", payload, request_id=request_id
                )
                operation_id = str(created.get("id") or created.get("operation_id") or "").strip()
                if not operation_id:
                    raise ValueError("Video API response is missing operation_id")
                operation = created

            operation = await self._poll(operation_id, operation, params, request_id)
            status = self._status(operation)
            extra = {"operation_id": operation_id, "status": status}
            if operation.get("timed_out"):
                extra["timed_out"] = True
                return VideoToolResult(ok=True, content=f"Video task is still processing, operation_id={operation_id}", videos=[], extra_info=extra)
            if status != "succeeded":
                message = self._error_message(operation) or f"Video generation failed, status: {status or 'unknown'}"
                return VideoToolResult(
                    ok=False,
                    content=self._failure_content(message),
                    videos=[],
                    extra_info=extra,
                )

            video_url = ((operation.get("output") or {}).get("video_url"))
            if not video_url:
                raise ValueError("Video task succeeded but output.video_url is missing")
            stem = generate_safe_filename(params.video_name or params.prompt) or operation_id
            saved_path, relative = await self._download_video(
                tool_context, video_url, params.output_path, stem, params.override
            )
            extra["saved_video_relative_path"] = relative
            result = VideoToolResult(
                ok=True,
                content=f"Video generated: {relative}",
                videos=[saved_path],
                extra_info=extra,
            )
            result.video_url = saved_path
            return result
        except Exception as exc:
            extra = {"error": str(exc)}
            if operation_id:
                extra["operation_id"] = operation_id
            return VideoToolResult(
                ok=False,
                content=self._failure_content(str(exc)),
                videos=[],
                extra_info=extra,
            )

    async def _build_payload(
        self, tool_context: Optional[ToolContext], params: GenerateVideoParams
    ) -> Dict[str, Any]:
        model_id, config = self._resolve_model_config(tool_context, params.model_id)
        input_mode = params.input_mode or self._infer_input_mode(params, config)
        self._validate_input_mode(input_mode, params.task, params, config)
        generation = self._build_generation(params, config)
        payload: Dict[str, Any] = {
            "model_id": model_id,
            "task": params.task,
            "input_mode": input_mode,
            "prompt": params.prompt,
        }
        inputs: Dict[str, Any] = {}
        for key, values in (
            ("reference_images", params.reference_image_paths),
            ("reference_videos", params.reference_video_paths),
            ("reference_audios", params.reference_audio_paths),
        ):
            if values:
                inputs[key] = [{"uri": await self._resolve_input_uri(value)} for value in values]
        frames = []
        if params.frame_start_path:
            frames.append({"role": "start", "uri": await self._resolve_input_uri(params.frame_start_path)})
        if params.frame_end_path:
            frames.append({"role": "end", "uri": await self._resolve_input_uri(params.frame_end_path)})
        if frames:
            inputs["frames"] = frames
        if inputs:
            payload["inputs"] = inputs
        if generation:
            payload["generation"] = generation
        if params.extensions:
            payload["extensions"] = params.extensions
        business_params = self._business_params()
        if business_params:
            payload["business_params"] = business_params
        return payload

    @staticmethod
    def _resolve_model_config(
        tool_context: Optional[ToolContext], requested_model: str
    ) -> tuple[str, Dict[str, Any]]:
        model_context = None
        if tool_context is not None:
            agent_context = tool_context.get_extension("agent_context")
            model_context = getattr(agent_context, "model_context", None) if agent_context else None
        context_model = getattr(model_context, "video_model_id", None) if model_context else None
        video_spec = getattr(model_context, "video", None) if model_context else None
        config = getattr(video_spec, "video_generation_config", None) or {}
        requested = requested_model.strip()
        if requested and context_model and requested.casefold() != str(context_model).casefold():
            raise ValueError(f"The current session video model is {context_model}; use it or omit model_id")
        model_id = context_model or requested
        if not model_id:
            raise ValueError("No video model is available in the current session")
        if not isinstance(config, dict) or not config:
            raise ValueError(f"Video model {model_id} is missing generation capability configuration")
        return str(model_id), config

    @staticmethod
    def _infer_input_mode(
        params: GenerateVideoParams, config: Dict[str, Any]
    ) -> str:
        if params.task == "edit":
            return "video_edit"
        modes = config.get("input_modes") or {}
        if not isinstance(modes, dict):
            raise ValueError("The current video model has no available input modes")
        required = set()
        if params.frame_start_path or params.frame_end_path:
            required.add("frames")
        if params.reference_image_paths:
            required.add("reference_images")
        if params.reference_video_paths:
            required.add("reference_videos")
        if params.reference_audio_paths:
            required.add("reference_audios")
        if not required:
            if "standard" in modes:
                return "standard"
            raise ValueError("The current video model does not support text-to-video generation")
        preferred = []
        if "frames" in required:
            preferred.append("keyframe_guided")
        elif required == {"reference_images"}:
            preferred.append("image_reference")
        elif "reference_videos" in required or "reference_audios" in required:
            preferred.append("omni_reference")
        preferred.extend(name for name in modes if name not in preferred)
        for name in preferred:
            mode = modes.get(name)
            supported = set(mode.get("supported_fields") or []) if isinstance(mode, dict) else set()
            if required.issubset(supported):
                return name
        fields = ", ".join(sorted(required)) or "纯文本"
        raise ValueError(f"The current video model has no input mode supporting: {fields}")

    @staticmethod
    def _validate_input_mode(
        mode: str, task: str, params: GenerateVideoParams, config: Dict[str, Any]
    ) -> None:
        modes = config.get("input_modes") or {}
        mode_config = modes.get(mode) if isinstance(modes, dict) else None
        if not isinstance(mode_config, dict):
            raise ValueError(f"The current video model does not support input mode: {mode}")
        expected_task = mode_config.get("task")
        if expected_task and task != expected_task:
            raise ValueError(f"Input mode {mode} only supports task={expected_task}")
        provided = set()
        if params.reference_image_paths:
            provided.add("reference_images")
        if params.reference_video_paths:
            provided.add("reference_videos")
        if params.reference_audio_paths:
            provided.add("reference_audios")
        if params.frame_start_path or params.frame_end_path:
            provided.add("frames")
        supported = set(mode_config.get("supported_fields") or [])
        unsupported = provided - supported
        if unsupported:
            raise ValueError(f"Input mode {mode} does not support: {', '.join(sorted(unsupported))}")
        GenerateVideo._validate_input_constraints(params, config)

    @staticmethod
    def _validate_input_constraints(
        params: GenerateVideoParams, config: Dict[str, Any]
    ) -> None:
        constraints = config.get("constraints") or {}
        counts = {
            "reference_images": len(params.reference_image_paths),
            "reference_videos": len(params.reference_video_paths),
            "reference_audios": len(params.reference_audio_paths),
        }
        for key, count in counts.items():
            maximum = constraints.get(f"{key}_max_count")
            if isinstance(maximum, int) and count > maximum:
                raise ValueError(f"{key} supports at most {maximum} items")
        if (
            params.reference_audio_paths
            and constraints.get("reference_audios_require_image_or_video") is True
            and not (params.reference_image_paths or params.reference_video_paths)
        ):
            raise ValueError("Reference audio must be used with a reference image or video")
        if (
            constraints.get("frames_and_reference_media_mutually_exclusive") is True
            and (params.frame_start_path or params.frame_end_path)
            and any(counts.values())
        ):
            raise ValueError("Start/end frames cannot be used with reference media")

    @staticmethod
    def _build_generation(params: GenerateVideoParams, config: Dict[str, Any]) -> Dict[str, Any]:
        capability = config.get("generation") or {}
        sizes = capability.get("sizes") or []
        if not isinstance(sizes, list) or not sizes:
            raise ValueError("The current video model has no available video sizes")
        selected = None
        if params.size:
            selected = next((item for item in sizes if isinstance(item, dict) and item.get("value") == params.size), None)
            if selected is None:
                legal = [item.get("value") for item in sizes if isinstance(item, dict) and item.get("value")]
                raise ValueError(f"The current video model does not support size {params.size}; valid values: {', '.join(legal)}")
            if params.aspect_ratio and params.aspect_ratio != selected.get("label"):
                raise ValueError(
                    f"Size {params.size} requires aspect ratio {selected.get('label')}; "
                    f"it conflicts with specified value {params.aspect_ratio}"
                )
            if params.resolution and params.resolution != selected.get("resolution"):
                raise ValueError(
                    f"Size {params.size} requires resolution {selected.get('resolution')}; "
                    f"it conflicts with specified value {params.resolution}"
                )
        else:
            candidates = [item for item in sizes if isinstance(item, dict)]
            if params.aspect_ratio:
                candidates = [item for item in candidates if item.get("label") == params.aspect_ratio]
            if params.resolution:
                candidates = [item for item in candidates if item.get("resolution") == params.resolution]
            selected = candidates[0] if candidates else None
            if selected is None:
                raise ValueError("No valid size matches the requested video parameters")
        duration = (
            params.duration_seconds
            if params.duration_seconds is not None
            else capability.get("default_duration_seconds")
        )
        GenerateVideo._validate_choice("时长", duration, capability.get("durations"))
        aspect_ratio = params.aspect_ratio or selected.get("label")
        resolution = params.resolution or selected.get("resolution")
        GenerateVideo._validate_choice("宽高比", aspect_ratio, capability.get("aspect_ratios"))
        GenerateVideo._validate_choice("分辨率", resolution, capability.get("resolutions"))
        if params.watermark is not None and capability.get("supports_watermark") is False:
            raise ValueError("The current video model does not support watermark")
        return {
            key: value
            for key, value in (
                ("size", selected.get("value")),
                ("duration_seconds", duration),
                ("aspect_ratio", aspect_ratio),
                ("resolution", resolution),
                ("fps", params.fps),
                ("seed", params.seed),
                ("watermark", params.watermark),
            )
            if value is not None and value != ""
        }

    @staticmethod
    def _validate_choice(name: str, value: Any, choices: Any) -> None:
        if value is not None and isinstance(choices, list) and choices and value not in choices:
            raise ValueError(f"The current video model does not support {name} {value}; valid values: {', '.join(map(str, choices))}")

    async def _poll(
        self,
        operation_id: str,
        operation: Dict[str, Any],
        params: GenerateVideoParams,
        request_id: str,
    ) -> Dict[str, Any]:
        status = self._status(operation)
        elapsed = 0.0
        while status not in TERMINAL_STATUSES and elapsed < params.poll_timeout_seconds:
            interval = min(params.poll_interval_seconds, params.poll_timeout_seconds - elapsed)
            await asyncio.sleep(interval)
            elapsed += interval
            operation = await self._request_json(
                "GET", f"/videos/{operation_id}", request_id=request_id
            )
            status = self._status(operation)
        if status not in TERMINAL_STATUSES:
            operation = dict(operation)
            operation["timed_out"] = True
        return operation

    async def _request_json(
        self,
        method: str,
        path: str,
        payload: Optional[Dict[str, Any]] = None,
        request_id: str = "",
    ) -> Dict[str, Any]:
        config = self._config or MagicServiceConfigLoader.load_with_fallback()
        self._config = config
        url = f"{self._video_api_base(config.api_base_url)}{path}"
        headers = self._headers(request_id)
        async with aiohttp.ClientSession() as session:
            async with session.request(method, url, json=payload, headers=headers, timeout=600) as response:
                text = await response.text()
                content_type = response.headers.get("Content-Type", "")
                context = self._response_context(
                    method, path, response.status, content_type, text
                )
                if response.status >= 400:
                    data = None
                    if text.strip():
                        try:
                            data = json.loads(text)
                        except json.JSONDecodeError:
                            pass
                    message = self._error_message(data) if isinstance(data, dict) else ""
                    suffix = f"；服务错误：{message}" if message else ""
                    raise ValueError(f"Video API request failed: HTTP {response.status}; {context}{suffix}")
                if not text.strip():
                    raise ValueError(f"Video API returned an empty response; {context}")
                try:
                    data = json.loads(text)
                except json.JSONDecodeError as exc:
                    raise ValueError(f"Video API returned invalid JSON; {context}") from exc
                if not isinstance(data, dict):
                    raise ValueError(f"Video API response must be a JSON object; {context}")
                return data

    @staticmethod
    def _response_context(
        method: str, path: str, status: int, content_type: str, body: str
    ) -> str:
        summary = " ".join(body.split())[:300] or "<empty>"
        return (
            f"method={method} path={path} status={status} "
            f"content_type={content_type or '<missing>'} body={summary!r}"
        )

    async def _resolve_input_uri(self, value: str) -> str:
        if value.startswith(("http://", "https://")):
            return value
        path = self.resolve_path(value)
        if not await async_exists(str(path)):
            raise ValueError(f"Reference asset does not exist: {value}")
        return await generate_presigned_url(str(path))

    @staticmethod
    def _video_api_base(api_base_url: str) -> str:
        parsed = urlparse(api_base_url.strip().rstrip("/"))
        path = re.sub(r"/v\d+$", "", parsed.path.rstrip("/"))
        return parsed._replace(path=f"{path}/v1").geturl().rstrip("/")

    @staticmethod
    def _headers(request_id: str) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        MetadataUtil.add_magic_and_user_authorization_headers(headers)
        if request_id:
            headers["request-id"] = request_id
        if MetadataUtil.is_initialized():
            metadata = MetadataUtil.get_metadata()
            for source, target in (
                ("super_magic_task_id", "Magic-Task-Id"),
                ("topic_id", "Magic-Topic-Id"),
                ("chat_topic_id", "Magic-Chat-Topic-Id"),
                ("language", "Magic-Language"),
            ):
                if metadata.get(source):
                    headers[target] = str(metadata[source])
        return headers

    @staticmethod
    def _business_params() -> Dict[str, str]:
        if not MetadataUtil.is_initialized():
            return {}
        project_id = MetadataUtil.get_metadata().get("project_id")
        return {"project_id": project_id.strip()} if isinstance(project_id, str) and project_id.strip() else {}

    async def _download_video(self, tool_context: ToolContext, url: str, output_path: str, video_name: str, override: bool):
        save_dir = self.resolve_path(output_path or DEFAULT_OUTPUT_PATH)
        await async_mkdir(save_dir, parents=True, exist_ok=True)
        target = save_dir / f"{video_name}.mp4"
        if not override:
            index = 1
            while await async_exists(str(target)):
                target = save_dir / f"{video_name}_{index}.mp4"
                index += 1
        temporary = target.with_name(f".{target.name}.{uuid.uuid4().hex}.part")
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, timeout=600) as response:
                    if response.status >= 400:
                        raise ValueError(f"Video download failed: HTTP {response.status}")
                    async with aiofiles.open(temporary, "wb") as file:
                        downloaded = 0
                        async for chunk in response.content.iter_chunked(1024 * 1024):
                            downloaded += len(chunk)
                            if downloaded > MAX_DOWNLOAD_BYTES:
                                raise ValueError("Video file is too large")
                            await file.write(chunk)
            async with self._file_versioning_context(
                tool_context, target, update_timestamp=False
            ):
                await async_replace(temporary, target)
        except Exception:
            if await async_exists(temporary):
                await async_unlink(temporary)
            raise
        return str(target), str(target.relative_to(Path(self.base_dir)))

    @staticmethod
    def _status(operation: Dict[str, Any]) -> str:
        return str(operation.get("status", "")).strip().lower()

    @staticmethod
    def _error_message(operation: Dict[str, Any]) -> str:
        error = operation.get("error") if isinstance(operation, dict) else None
        if isinstance(error, dict):
            return str(error.get("message") or error.get("detail") or "")
        return str(error or operation.get("message") or "") if isinstance(operation, dict) else ""

    @staticmethod
    def _failure_content(reason: str) -> str:
        return (
            f"Generation failed: {reason}\n"
            "Failure does not deduct points. Explain the reason and offer two options: revise the prompt and retry, or end this generation; "
            "do not call generate_images or another tool, and do not retry automatically."
        )
