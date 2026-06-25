"""AI 视频生成并添加到画布工具（任务列表版）

每个 task 独立指定 prompt / name，并可按当前视频模型规则设置 aspect_ratio / duration_seconds / resolution，
有几个 task 就生成几个视频，并发执行。
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, ClassVar, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from agentlang.utils.metadata import MetadataUtil
from app.core.entity.message.server_message import DisplayType, ToolDetail
from app.infrastructure.magic_service.client import MagicServiceClient
from app.infrastructure.magic_service.exceptions import ApiError
from app.i18n import i18n
from app.tools.core import BaseToolParams, tool
from app.tools.design.tools.base_generate_canvas_elements import (
    BaseGenerateCanvasElements,
    ElementDetail,
    PlaceholderUpdate,
    TaskExecutionResult,
    TaskPlaceholderInfo,
)
from app.utils.async_file_utils import async_exists, async_mkdir
from app.utils.video_logger import get_video_logger

logger = get_video_logger(__name__)

DEFAULT_CANVAS_ASPECT_RATIO = "16:9"
DEFAULT_CANVAS_RESOLUTION = "720p"

VIDEO_TASK_ALIASES = {
    "generater": "generate",
    "generator": "generate",
}
VIDEO_INPUT_MODE_ALIASES = {
    "video_editing": "video_edit",
}

def _parse_aspect_ratio(value: str) -> tuple[int, int] | None:
    match = re.fullmatch(r"\s*(\d+)\s*:\s*(\d+)\s*", value or "")
    if not match:
        return None
    width_ratio = int(match.group(1))
    height_ratio = int(match.group(2))
    if width_ratio <= 0 or height_ratio <= 0:
        return None
    return width_ratio, height_ratio


def _normalize_resolution(value: str) -> str:
    normalized = str(value or "").strip().lower()
    return "4k" if normalized in {"4k", "2160p"} else normalized


def _resolve_resolution_base_height(resolution: str) -> int | None:
    normalized_resolution = _normalize_resolution(resolution)
    if normalized_resolution == "4k":
        return 2160

    p_match = re.fullmatch(r"(\d+)p", normalized_resolution)
    if p_match:
        return int(p_match.group(1))

    k_match = re.fullmatch(r"(\d+)k", normalized_resolution)
    if k_match:
        k_value = int(k_match.group(1))
        if k_value == 2:
            return 1440
        return k_value * 540

    return None


def _resolve_canvas_dimensions(aspect_ratio: str, resolution: str) -> tuple[int, int]:
    normalized_aspect_ratio = str(aspect_ratio or "").strip()
    ratio = _parse_aspect_ratio(normalized_aspect_ratio)
    if ratio is None:
        raise ValueError(f"Invalid aspect_ratio: '{aspect_ratio}'. Use W:H format, for example 16:9")

    base_height = _resolve_resolution_base_height(resolution)
    if base_height is None:
        raise ValueError(f"Invalid resolution: '{resolution}'. Use values like 720p, 1080p, or 4k")

    base_width = round(base_height * 16 / 9)
    target_area = base_width * base_height
    ratio_value = ratio[0] / ratio[1]
    height = round((target_area / ratio_value) ** 0.5)
    width = round(height * ratio_value)
    return width, height


def _format_tool_context_for_log(tool_context: Optional[ToolContext]) -> str:
    if tool_context is None:
        return "tool_context=none agent_context=missing"
    agent_context = tool_context.get_extension("agent_context")
    return (
        f"tool_context=present agent_context={'present' if agent_context else 'missing'} "
        f"tool_name={getattr(tool_context, 'tool_name', '') or ''} "
        f"tool_call_id={getattr(tool_context, 'tool_call_id', '') or ''}"
    )


def _normalize_video_task_value(value: Any, default: str = "generate") -> str:
    normalized = str(value or "").strip()
    if not normalized:
        return default
    normalized = normalized.lower()
    return VIDEO_TASK_ALIASES.get(normalized, normalized)


def _normalize_video_input_mode_value(value: Any) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        return ""
    normalized = normalized.lower()
    return VIDEO_INPUT_MODE_ALIASES.get(normalized, normalized)


@dataclass
class VideoPlaceholderUpdate(PlaceholderUpdate):
    """视频元素的占位符更新内容

    Attributes:
        src: 视频文件相对路径
        poster: 封面图相对路径
        generateVideoRequest: 生成时使用的参数记录
        errorMessage: 失败时的错误信息
        width: 实际视频宽度
        height: 实际视频高度
    """

    src: Optional[str] = None
    poster: Optional[str] = None
    generateVideoRequest: Optional[Dict[str, Any]] = None
    errorMessage: Optional[str] = None
    width: Optional[float] = None
    height: Optional[float] = None


class VideoTaskSpec(BaseModel):
    """单个视频生成任务"""

    model_config = ConfigDict(extra="forbid")

    _PARAM_ALIASES: ClassVar[Dict[str, str]] = {
        "duration": "duration_seconds",
        "image": "reference_image_paths",
        "images": "reference_image_paths",
        "reference_images": "reference_image_paths",
        "video": "reference_video_paths",
        "videos": "reference_video_paths",
        "reference_videos": "reference_video_paths",
        "audio": "reference_audio_paths",
        "audios": "reference_audio_paths",
        "reference_audios": "reference_audio_paths",
        "start_frame": "frame_start_path",
        "end_frame": "frame_end_path",
        "inputMode": "input_mode",
        "mode": "input_mode",
    }

    prompt: str = Field(
        ...,
        description="""<!--zh: 视频生成提示词。只描述视频内容、动作、风格和镜头；如果传入参考素材，必须在 prompt 中按数组顺序引用：reference_image_paths[0] 用 [image1]，reference_video_paths[0] 用 [video1]，reference_audio_paths[0] 用 [audio1]。例如：基于黑猫肖像 [image1] 制作动画，黑猫缓缓眨眼。-->
Video generation prompt. Describe only the video content, motion, style, and camera. When passing reference assets, the prompt must cite them by list order: reference_image_paths[0] as [image1], reference_video_paths[0] as [video1], and reference_audio_paths[0] as [audio1]. Example: Animate the black cat portrait [image1] with slow blinking."""
    )
    name: str = Field(
        ...,
        description="""<!--zh: 画布元素名称，应反映具体内容，不要用大类或编号替代。-->
Canvas element label. Must reflect the specific content of this video — not a generic category or numbered slot."""
    )
    aspect_ratio: Optional[str] = Field(
        None,
        description="""<!--zh: 生成视频宽高比，可选，例如 16:9、9:16、1:1。用户指定或能根据当前视频模型规则合理推断时，从 <media_model_info> 声明的合法值中选择；不确定时省略。-->
Generated video aspect ratio, optional, e.g. 16:9, 9:16, 1:1. When the user asks for it, or it can be reasonably inferred from the current video model rules, choose a declared value from <media_model_info>; omit when uncertain."""
    )
    input_mode: str = Field(
        "",
        description="""<!--zh: 视频输入模式，可选。必须使用媒体模型上下文 <mode name="..."> 的精确值，例如 video_edit。不要使用 inputMode，也不要写 video_editing。-->
Video input mode, optional. Use the exact <mode name="..."> value from media model context, e.g. video_edit. Do not use inputMode or video_editing."""
    )
    task: str = Field(
        "generate",
        description="""<!--zh: 视频任务类型，默认 generate。使用 video_edit 模式时必须传 edit。不要写 generater。-->
Video task type, default generate. Use edit with video_edit mode. Do not use generater."""
    )
    reference_image_paths: List[str] = Field(
        default_factory=list,
        description="""<!--zh: 项目文件树内的参考图相对路径列表，例如 images/cat.png。传入后必须在 prompt 中按数组顺序引用：reference_image_paths[0] 用 [image1]，reference_image_paths[1] 用 [image2]。-->
Project-relative reference image paths, e.g. images/cat.png. When provided, the prompt must cite them by list order: reference_image_paths[0] as [image1], reference_image_paths[1] as [image2]."""
    )
    reference_video_paths: List[str] = Field(
        default_factory=list,
        description="""<!--zh: 项目文件树内的参考视频相对路径列表，例如 videos/source.mp4。传入后必须在 prompt 中按数组顺序引用：reference_video_paths[0] 用 [video1]，reference_video_paths[1] 用 [video2]。-->
Project-relative reference video paths, e.g. videos/source.mp4. When provided, the prompt must cite them by list order: reference_video_paths[0] as [video1], reference_video_paths[1] as [video2]."""
    )
    reference_audio_paths: List[str] = Field(
        default_factory=list,
        description="""<!--zh: 项目文件树内的参考音频相对路径列表，例如 audios/source.mp3。传入后必须在 prompt 中按数组顺序引用：reference_audio_paths[0] 用 [audio1]，reference_audio_paths[1] 用 [audio2]。-->
Project-relative reference audio paths, e.g. audios/source.mp3. When provided, the prompt must cite them by list order: reference_audio_paths[0] as [audio1], reference_audio_paths[1] as [audio2]."""
    )
    frame_start_path: str = Field(
        "",
        description="""<!--zh: 项目文件树内的起始帧图片相对路径，例如 images/start.png。字段名必须是 frame_start_path。不要使用 start_frame。-->
Project-relative start frame image path, e.g. images/start.png. The parameter name must be frame_start_path. Do not use start_frame."""
    )
    frame_end_path: str = Field(
        "",
        description="""<!--zh: 项目文件树内的结束帧图片相对路径，例如 images/end.png。字段名必须是 frame_end_path。不要使用 end_frame。-->
Project-relative end frame image path, e.g. images/end.png. The parameter name must be frame_end_path. Do not use end_frame."""
    )
    duration_seconds: Optional[int] = Field(
        None,
        description="""<!--zh: 视频时长（秒），可选。字段名必须是 duration_seconds。用户指定或能根据当前视频模型规则合理推断时，从 <media_model_info> 声明的合法值中选择；不要使用 duration。-->
Video duration in seconds, optional. The parameter name must be duration_seconds. When the user asks for it, or it can be reasonably inferred from the current video model rules, choose a declared value from <media_model_info>. Do not use duration."""
    )
    resolution: Optional[str] = Field(
        None,
        description="""<!--zh: 视频清晰度档位，可选，字段名必须是 resolution。常见格式：720p、1080p、4k。用户指定或能根据当前视频模型规则合理推断时，从 <media_model_info> 声明的合法值中选择；不要传 1280x720 这种尺寸。-->
Video quality/resolution tier, optional. The parameter name must be resolution. Common format: 720p, 1080p, 4k. When the user asks for it, or it can be reasonably inferred from the current video model rules, choose a declared value from <media_model_info>. Do not pass dimensions like 1280x720."""
    )
    fps: Optional[int] = Field(default=None, description="<!--zh: 视频帧率，可选-->Video FPS, optional")
    seed: Optional[int] = Field(default=None, description="<!--zh: 随机种子，可选-->Random seed, optional")
    watermark: Optional[bool] = Field(default=None, description="<!--zh: 是否保留水印，可选-->Keep watermark, optional")
    extensions: Dict[str, Any] = Field(
        default_factory=dict,
        description="<!--zh: 透传扩展参数-->Pass-through extension config"
    )
    element_id: Optional[str] = Field(
        None,
        description="""<!--zh: 可选。传入时复用画布上已有的元素（如上次生成失败的占位符），工具直接在该元素上重新生成并更新，不新建占位符。不传时新建占位符。-->
Optional. When provided, the tool reuses an existing canvas element (e.g. a failed placeholder from a previous attempt) and regenerates in place without creating a new placeholder. Omit to create a new element."""
    )

    @model_validator(mode="before")
    @classmethod
    def normalize_common_parameter_aliases(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value

        normalized = dict(value)
        extensions = normalized.get("extensions")
        if isinstance(extensions, dict):
            normalized_extensions = dict(extensions)
            for alias in ("inputMode", "input_mode"):
                if "input_mode" not in normalized and alias in normalized_extensions:
                    normalized["input_mode"] = normalized_extensions.pop(alias)
                    break
            if "task" not in normalized and "task" in normalized_extensions:
                normalized["task"] = normalized_extensions.pop("task")
            normalized["extensions"] = normalized_extensions

        for alias, field_name in cls._PARAM_ALIASES.items():
            if alias not in normalized:
                continue

            alias_value = normalized.pop(alias)
            if field_name in normalized:
                continue

            if field_name.endswith("_paths") and isinstance(alias_value, str):
                normalized[field_name] = [alias_value]
                continue

            normalized[field_name] = alias_value

        # width/height used to be public canvas fields. They are now derived from aspect_ratio + resolution.
        normalized.pop("width", None)
        normalized.pop("height", None)

        return normalized

    @field_validator("prompt")
    @classmethod
    def validate_prompt(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("prompt 不能为空")
        return v

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("name 不能为空")
        return v

    @field_validator("aspect_ratio")
    @classmethod
    def validate_aspect_ratio(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        if not isinstance(value, str) or not value.strip():
            raise ValueError("aspect_ratio must use W:H format, for example 16:9")
        if _parse_aspect_ratio(value) is None:
            raise ValueError(f"Invalid aspect_ratio: '{value}'. Use W:H format, for example 16:9")
        return value.strip()

    @field_validator("duration_seconds")
    @classmethod
    def validate_duration_seconds(cls, value: Optional[int]) -> Optional[int]:
        if value is None:
            return None
        if not isinstance(value, int) or value <= 0:
            raise ValueError("duration_seconds must be a positive integer")
        return value

    @field_validator("resolution")
    @classmethod
    def validate_resolution(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        if not isinstance(value, str) or not value.strip():
            raise ValueError("resolution must use values like 720p, 1080p, or 4k")
        return _normalize_resolution(value)

    @field_validator("input_mode", mode="before")
    @classmethod
    def normalize_input_mode(cls, value: Any) -> str:
        return _normalize_video_input_mode_value(value)

    @field_validator("task", mode="before")
    @classmethod
    def normalize_task(cls, value: Any) -> str:
        return _normalize_video_task_value(value)

    @model_validator(mode="after")
    def validate_reference_tokens(self) -> "VideoTaskSpec":
        missing_tokens = []
        missing_tokens.extend(self._missing_reference_tokens("image", len(self.reference_image_paths)))
        missing_tokens.extend(self._missing_reference_tokens("video", len(self.reference_video_paths)))
        missing_tokens.extend(self._missing_reference_tokens("audio", len(self.reference_audio_paths)))
        if missing_tokens:
            raise ValueError(
                "When using reference assets, the prompt must include reference tokens by list order: "
                f"{', '.join(missing_tokens)}. "
                "Example: White long-haired kitten [image1] peeks out of the black box, "
                "black short-haired kitten [image2] jumps out of the white box."
            )
        return self

    def _missing_reference_tokens(self, token_type: str, reference_count: int) -> List[str]:
        if reference_count <= 0:
            return []

        missing_tokens = []
        for index in range(1, reference_count + 1):
            token = f"[{token_type}{index}]"
            if re.search(re.escape(token), self.prompt, flags=re.IGNORECASE) is None:
                missing_tokens.append(token)
        return missing_tokens

    @property
    def canvas_dimensions(self) -> tuple[int, int]:
        return _resolve_canvas_dimensions(
            self.aspect_ratio or DEFAULT_CANVAS_ASPECT_RATIO,
            self.resolution or DEFAULT_CANVAS_RESOLUTION,
        )


class GenerateCanvasVideosParams(BaseToolParams):
    """generate_canvas_videos 工具参数"""

    project_path: str = Field(
        ...,
        description="""<!--zh: 设计项目的相对路径（包含 magic.project.js 的文件夹）-->
Relative path to the design project (folder containing magic.project.js)"""
    )
    tasks: List[VideoTaskSpec] = Field(
        ...,
        description="""<!--zh: 视频生成任务列表，每个 task 生成一个视频，最多 4 个。每个 task 必须包含 prompt / name。aspect_ratio / duration_seconds / resolution 可选；用户指定或能根据当前视频模型规则合理推断时，从 <media_model_info> 声明的合法值中选择，不确定时省略。其他字段必须使用本 schema 中的精确字段名。常见正确字段：duration_seconds（不是 duration）、reference_image_paths（不是 images/image）、reference_video_paths（不是 videos/video）、frame_start_path（不是 start_frame）、frame_end_path（不是 end_frame）。使用参考素材时，prompt 必须用 [image1] / [video1] / [audio1] 按数组顺序绑定素材。示例：tasks=[{"prompt":"白色长毛小猫 [image1] 从黑色箱子里探头钻出，黑色短毛小猫 [image2] 从白色箱子里跳出来，橘色虎斑小猫 [image3] 从黄色箱子里爬出。","name":"三色箱子猫咪跳出","aspect_ratio":"16:9","duration_seconds":4,"resolution":"720p","reference_image_paths":["images/cat1.png","images/cat2.png","images/cat3.png"]}]-->
Video generation task list. Each task produces one video. Maximum 4 tasks per call. Each task must include prompt and name. aspect_ratio, duration_seconds, and resolution are optional; when the user asks for them, or they can be reasonably inferred from the current video model rules, choose declared values from <media_model_info>; omit when uncertain. Optional fields must use the exact schema names: duration_seconds (not duration), reference_image_paths (not images/image), reference_video_paths (not videos/video), frame_start_path (not start_frame), frame_end_path (not end_frame). When using reference assets, the prompt must bind them by list order with [image1] / [video1] / [audio1]. Example: tasks=[{"prompt":"White long-haired kitten [image1] peeks out of the black box, black short-haired kitten [image2] jumps out of the white box, orange tabby kitten [image3] climbs out of the yellow box.","name":"three_color_box_cats","aspect_ratio":"16:9","duration_seconds":4,"resolution":"720p","reference_image_paths":["images/cat1.png","images/cat2.png","images/cat3.png"]}]"""
    )
    model_id: str = Field("", description="<!--zh: 可选视频模型 ID，所有任务共用-->Optional video model ID, shared across all tasks")

    @classmethod
    def get_custom_error_message(cls, field_name: str, error_type: str) -> str | None:
        if error_type == "extra_forbidden" and field_name == "tasks":
            return (
                "generate_canvas_videos 的 tasks 中存在未定义参数。"
                "请只使用 task schema 里的精确字段名：prompt, name, aspect_ratio, duration_seconds, resolution, input_mode, task, "
                "reference_image_paths, reference_video_paths, reference_audio_paths, frame_start_path, "
                "frame_end_path, fps, seed, watermark, extensions, element_id。"
                "常见改名：duration -> duration_seconds；images/image/reference_images -> reference_image_paths；"
                "videos/video/reference_videos -> reference_video_paths；start_frame -> frame_start_path；"
                "end_frame -> frame_end_path。"
                "正确示例：tasks=[{'prompt':'白色长毛小猫 [image1] 从黑色箱子里探头钻出，"
                "黑色短毛小猫 [image2] 从白色箱子里跳出来，橘色虎斑小猫 [image3] 从黄色箱子里爬出。', "
                "'name':'三色箱子猫咪跳出', "
                "'aspect_ratio':'16:9', 'duration_seconds':4, 'resolution':'720p', "
                "'reference_image_paths':['images/cat1.png','images/cat2.png','images/cat3.png']}]."
            )
        return None

    @field_validator("tasks")
    @classmethod
    def validate_tasks(cls, v: List[VideoTaskSpec]) -> List[VideoTaskSpec]:
        if not v or len(v) == 0:
            raise ValueError("tasks 不能为空列表，至少需要一个任务")
        if len(v) > 4:
            raise ValueError("tasks 最多支持 4 个")
        return v


@tool()
class GenerateCanvasVideos(BaseGenerateCanvasElements[GenerateCanvasVideosParams]):
    """<!--zh: 按任务列表生成 AI 视频并自动添加到画布。每个 task 独立指定提示词，并可按模型规则设置宽高比、时长和清晰度；有几个 task 就生成几个视频，并发执行。-->
    Generate AI videos and automatically add them to the canvas, one video per task. Each task independently specifies prompt, and may set aspect ratio, duration, and resolution according to model rules; all tasks run concurrently.
    """

    # 视频每行最多 4 个（与任务上限一致）
    _max_elements_per_row: int = 4

    def __init__(self, **data):
        super().__init__(**data)
        self._magic_service_client: Optional[MagicServiceClient] = None
        self._task_video_ids: Dict[int, str] = {}
        # 全局参数缓存，在 execute() 中写入，供 _prepare_task_kwargs / _execute_task_item 读取
        self._model_id: str = ""

    async def execute(self, tool_context: ToolContext, params: GenerateCanvasVideosParams) -> ToolResult:
        try:
            logger.info(
                f"开始执行设计生视频: {_format_tool_context_for_log(tool_context)} "
                f"project_path={params.project_path} tasks={len(params.tasks)}"
            )
            # 缓存全局参数（单事件循环语义下安全）
            self._model_id = params.model_id
            self._task_video_ids = {}
            workspace_root = Path(self.base_dir)
            project_prefix = params.project_path.strip("/")
            await self._normalize_reference_paths(params.tasks, workspace_root, project_prefix)
            return await self._run_generate_flow(tool_context, params.project_path, params.tasks)
        except Exception as e:
            logger.exception(f"generate_canvas_videos 失败: {e!s}")
            return ToolResult.error(
                f"生成视频到画布失败: {e!s}",
                extra_info={"error_type": "design.error_unexpected"},
            )

    # ------------------------------------------------------------------
    # 实现抽象接口
    # ------------------------------------------------------------------

    def _get_task_placeholder_info(self, task: VideoTaskSpec, idx: int) -> TaskPlaceholderInfo:
        width, height = task.canvas_dimensions
        return TaskPlaceholderInfo(
            name=task.name,
            width=float(width),
            height=float(height),
            element_type="video",
        )

    async def _execute_task_item(
        self,
        idx: int,
        task: VideoTaskSpec,
        placeholder: ElementDetail,
        tool_context: ToolContext,
        project_path: Path,
        _relative_project_path: str = "",
        **kwargs: Any,
    ) -> TaskExecutionResult:
        logger.info(
            f"开始生成设计视频子任务: index={idx} name={task.name} "
            f"{_format_tool_context_for_log(tool_context)}"
        )

        project_id = str(kwargs.get("project_id") or "").strip()
        design_file_dir = str(kwargs.get("design_file_dir") or "").strip()
        if not project_id:
            raise ValueError("缺少 project_id，无法创建后台托管的视频任务")
        if not design_file_dir:
            raise ValueError("缺少 file_dir，无法创建后台托管的视频任务")

        video_id = self._ensure_task_video_id(idx)
        try:
            model_id = self._resolve_video_model(self._model_id, tool_context)
            payload = self._build_design_video_request(
                task=task,
                project_id=project_id,
                video_id=video_id,
                model_id=model_id,
                file_dir=design_file_dir,
                relative_project_path=_relative_project_path,
            )
            logger.info(
                f"设计视频子任务提交后台托管任务: index={idx} name={task.name} "
                f"project_id={project_id} video_id={video_id} file_dir={design_file_dir} "
                f"reference_image_count={len(payload.get('inputs', {}).get('reference_images', []))} "
                f"reference_video_count={len(payload.get('inputs', {}).get('reference_videos', []))} "
                f"reference_audio_count={len(payload.get('inputs', {}).get('reference_audios', []))} "
                f"task={payload.get('task') or ''} input_mode={payload.get('input_mode') or ''} "
                f"aspect_ratio={payload.get('generation', {}).get('aspect_ratio') or ''} "
                f"resolution={payload.get('generation', {}).get('resolution') or ''} "
                f"duration_seconds={payload.get('generation', {}).get('duration_seconds') or ''}"
            )
            response = await self._get_magic_service_client().generate_design_video(payload)
        except (ApiError, ValueError) as error:
            error_message = str(error)
            payload = self._build_initial_design_video_request(task, video_id)
            logger.warning(
                f"设计视频子任务提交失败: index={idx} name={task.name} "
                f"video_id={video_id} error={error_message}"
            )
            update = VideoPlaceholderUpdate(
                status="failed",
                generateVideoRequest=payload,
                errorMessage=error_message,
            )
            return TaskExecutionResult(
                index=idx,
                success=False,
                placeholder_update=update,
                error_message=error_message,
            )

        status = str(response.get("status") or "running")
        logger.info(
            f"设计视频子任务已提交后台托管: index={idx} name={task.name} "
            f"video_id={video_id} status={status}"
        )

        update = VideoPlaceholderUpdate(
            status="processing",
            generateVideoRequest=payload,
            errorMessage=None,
        )
        return TaskExecutionResult(
            index=idx,
            success=True,
            placeholder_update=update,
            metadata={
                "is_processing": True,
                "element_id": placeholder.id,
                "element_name": task.name,
                "video_id": video_id,
                "pending_status": status,
            },
        )

    # ------------------------------------------------------------------
    # 覆盖钩子
    # ------------------------------------------------------------------

    def _build_created_element_dict(
        self,
        placeholder: ElementDetail,
        task_result: TaskExecutionResult,
    ) -> Dict[str, Any]:
        d: Dict[str, Any] = {
            "id": placeholder.id,
            "type": placeholder.type,
            "name": placeholder.name,
            "width": placeholder.width,
            "height": placeholder.height,
        }
        if task_result.is_success:
            update = task_result.placeholder_update
            if isinstance(update, VideoPlaceholderUpdate):
                d["status"] = update.status
                if update.generateVideoRequest:
                    d["generateVideoRequest"] = update.generateVideoRequest
                if update.src:
                    d["src"] = update.src
                if update.poster:
                    d["poster"] = update.poster
        return d

    def _build_initial_placeholder_update(
        self,
        task: VideoTaskSpec,
        idx: int,
        element_id: str,
    ) -> Dict[str, Any]:
        return {
            "generateVideoRequest": self._build_initial_design_video_request(
                task,
                self._ensure_task_video_id(idx),
            )
        }

    async def _prepare_task_kwargs(
        self,
        tool_context: ToolContext,
        project_path: Path,
    ) -> Dict[str, Any]:
        workspace_path = Path(self.base_dir)
        relative_project_path = project_path.relative_to(workspace_path)
        design_file_dir = self._format_design_file_dir(str(relative_project_path / "videos"))
        project_id = self._resolve_project_id()
        await async_mkdir(project_path / "videos", parents=True, exist_ok=True)
        return {
            "design_file_dir": design_file_dir,
            "project_id": project_id,
            "_relative_project_path": str(relative_project_path),
        }

    async def _normalize_reference_paths(
        self,
        tasks: List[VideoTaskSpec],
        workspace_root: Path,
        project_prefix: str,
    ) -> None:
        for task in tasks:
            task.reference_image_paths = await self._normalize_path_list(
                task.reference_image_paths, workspace_root, project_prefix
            )
            task.reference_video_paths = await self._normalize_path_list(
                task.reference_video_paths, workspace_root, project_prefix
            )
            task.reference_audio_paths = await self._normalize_path_list(
                task.reference_audio_paths, workspace_root, project_prefix
            )
            task.frame_start_path = await self._normalize_path_value(
                task.frame_start_path, workspace_root, project_prefix
            )
            task.frame_end_path = await self._normalize_path_value(
                task.frame_end_path, workspace_root, project_prefix
            )

    async def _normalize_path_list(
        self,
        paths: List[str],
        workspace_root: Path,
        project_prefix: str,
    ) -> List[str]:
        return [
            await self._normalize_path_value(path, workspace_root, project_prefix)
            for path in paths
        ]

    async def _normalize_path_value(
        self,
        path: str,
        workspace_root: Path,
        project_prefix: str,
    ) -> str:
        if not path or path.startswith(("http://", "https://")) or Path(path).is_absolute():
            return path

        normalized = path.lstrip("/")
        if await async_exists(workspace_root / normalized):
            return normalized
        if project_prefix and await async_exists(workspace_root / project_prefix / normalized):
            return f"{project_prefix}/{normalized}"
        return normalized

    def _build_result_content(
        self,
        project_path: Path,
        tasks: List[Any],
        placeholders: List[ElementDetail],
        task_results: List[TaskExecutionResult],
    ) -> str:
        completed_results = [r for r in task_results if r.is_success and not r.metadata.get("is_processing")]
        pending_results = [r for r in task_results if r.metadata.get("is_processing")]
        failed_results = [r for r in task_results if r.is_failed]

        lines = [
            "Generated Videos and Added to Canvas:",
            f"- Completed: {len(completed_results)}",
            f"- Processing: {len(pending_results)}",
            f"- Failed: {len(failed_results)}",
            f"- Project: {project_path}",
        ]

        if completed_results:
            lines.append("")
            lines.append("Completed Elements:")
            for r in completed_results:
                p = placeholders[r.index]
                lines.append(f"- {p.name} (id: {p.id})")

        if pending_results:
            lines.extend([
                "",
                "These video tasks have been submitted as backend async design video tasks.",
                "The canvas placeholders contain video_id for frontend status polling.",
                "Pending Videos:",
            ])
            for r in pending_results:
                m = r.metadata
                lines.append(
                    f"- {m['element_name']} (element_id: {m['element_id']}), "
                    f"video_id: {m['video_id']}, "
                    f"status: {m['pending_status']}"
                )

        if failed_results:
            lines.append("")
            lines.append("Failed Elements (pass element_id to retry in place):")
            for r in failed_results:
                p = placeholders[r.index]
                lines.append(f'- {p.name} (element_id: "{p.id}")')

        return "\n".join(lines)

    def _collect_extra_info(
        self,
        tasks: List[Any],
        placeholders: List[ElementDetail],
        task_results: List[TaskExecutionResult],
    ) -> Dict[str, Any]:
        pending_videos = [
            {
                "element_id": r.metadata["element_id"],
                "element_name": r.metadata["element_name"],
                "video_id": r.metadata["video_id"],
                "status": r.metadata["pending_status"],
            }
            for r in task_results
            if r.metadata.get("is_processing")
        ]
        completed_count = sum(1 for r in task_results if r.is_success and not r.metadata.get("is_processing"))
        processing_count = len(pending_videos)
        failed_count = sum(1 for r in task_results if r.is_failed)
        return {
            "completed_count": completed_count,
            "processing_count": processing_count,
            "failed_count": failed_count,
            "pending_videos": pending_videos,
        }

    # ------------------------------------------------------------------
    # 私有辅助
    # ------------------------------------------------------------------

    def _get_magic_service_client(self) -> MagicServiceClient:
        if self._magic_service_client is None:
            self._magic_service_client = MagicServiceClient()
        return self._magic_service_client

    def _ensure_task_video_id(self, idx: int) -> str:
        video_id = self._task_video_ids.get(idx)
        if not video_id:
            video_id = self._generate_design_video_id()
            self._task_video_ids[idx] = video_id
        return video_id

    @staticmethod
    def _generate_design_video_id() -> str:
        return f"vid_{uuid.uuid4().hex}"

    @staticmethod
    def _resolve_project_id() -> str:
        if not MetadataUtil.is_initialized():
            raise ValueError("缺少 project_id，无法创建后台托管的视频任务")

        metadata = MetadataUtil.get_metadata()
        project_id = metadata.get("project_id")
        if isinstance(project_id, (str, int)) and str(project_id).strip():
            return str(project_id).strip()
        raise ValueError("缺少 project_id，无法创建后台托管的视频任务")

    @staticmethod
    def _resolve_video_model(requested_model: str, tool_context: Optional[ToolContext] = None) -> str:
        if requested_model and requested_model.strip():
            return requested_model.strip()

        if tool_context is not None:
            agent_context = tool_context.get_extension("agent_context")
            model_context = getattr(agent_context, "model_context", None) if agent_context else None
            video_model_id = getattr(model_context, "video_model_id", "") if model_context else ""
            if video_model_id:
                logger.info(f"从 AgentContext.model_context 获取视频模型: {video_model_id}")
                return video_model_id

        raise ValueError("未指定视频模型，且当前会话没有可用的视频模型")

    def _build_initial_design_video_request(
        self,
        task: VideoTaskSpec,
        video_id: str,
    ) -> Dict[str, Any]:
        input_mode = self._resolve_design_input_mode(task)
        payload: Dict[str, Any] = {
            "video_id": video_id,
            "model_id": self._model_id or None,
            "prompt": task.prompt,
            "input_mode": input_mode,
            "task": task.task or "generate",
        }
        generation = self._build_design_generation(task)
        if generation:
            payload["generation"] = generation
        payload["inputs"] = self._build_design_video_inputs(task)
        if task.extensions:
            payload["extensions"] = dict(task.extensions)
        return self._drop_empty_values(payload)

    def _build_design_video_request(
        self,
        task: VideoTaskSpec,
        project_id: str,
        video_id: str,
        model_id: str,
        file_dir: str,
        relative_project_path: str = "",
    ) -> Dict[str, Any]:
        input_mode = self._resolve_design_input_mode(task)
        payload: Dict[str, Any] = {
            "project_id": project_id,
            "video_id": video_id,
            "model_id": model_id,
            "prompt": task.prompt,
            "input_mode": input_mode,
            "task": task.task or "generate",
            "file_dir": self._format_design_file_dir(file_dir),
        }

        payload["inputs"] = self._build_design_video_inputs(task, relative_project_path)

        generation = self._build_design_generation(task)
        if generation:
            payload["generation"] = generation

        if task.extensions:
            payload["extensions"] = dict(task.extensions)

        return self._drop_empty_values(payload)

    def _build_design_video_inputs(
        self,
        task: VideoTaskSpec,
        relative_project_path: str = "",
    ) -> Dict[str, Any]:
        inputs: Dict[str, Any] = {
            "reference_images": [
                {"uri": self._to_design_workspace_path(path, relative_project_path)}
                for path in task.reference_image_paths
            ],
            "reference_videos": [
                {"uri": self._to_design_workspace_path(path, relative_project_path)}
                for path in task.reference_video_paths
            ],
            "reference_audios": [
                {"uri": self._to_design_workspace_path(path, relative_project_path)}
                for path in task.reference_audio_paths
            ],
            "frames": [],
        }

        frames = []
        if task.frame_start_path:
            frames.append({
                "role": "start",
                "uri": self._to_design_workspace_path(task.frame_start_path, relative_project_path),
            })
        if task.frame_end_path:
            frames.append({
                "role": "end",
                "uri": self._to_design_workspace_path(task.frame_end_path, relative_project_path),
            })
        inputs["frames"] = frames

        return inputs

    @staticmethod
    def _resolve_design_input_mode(task: VideoTaskSpec) -> str:
        if task.input_mode:
            return task.input_mode
        if task.task == "edit":
            return "video_edit"
        if task.frame_start_path or task.frame_end_path:
            return "keyframe_guided"
        if (
            task.reference_image_paths
            or task.reference_video_paths
            or task.reference_audio_paths
        ):
            return "omni_reference"
        return "standard"

    @staticmethod
    def _build_design_generation(task: VideoTaskSpec) -> Dict[str, Any]:
        generation: Dict[str, Any] = {
            "aspect_ratio": task.aspect_ratio or None,
            "duration_seconds": task.duration_seconds,
            "resolution": task.resolution or None,
            "fps": task.fps,
            "seed": task.seed,
            "watermark": task.watermark,
        }
        return GenerateCanvasVideos._drop_empty_values(generation)

    def _to_design_workspace_path(self, path: str, relative_project_path: str = "") -> str:
        path = (path or "").strip()
        if not path:
            raise ValueError("参考素材路径不能为空")
        if path.startswith(("http://", "https://")):
            raise ValueError(f"后台托管的视频任务暂不支持外部 URL 参考素材: {path}")

        if path.startswith("./"):
            if not relative_project_path:
                raise ValueError(f"无法解析项目相对参考素材路径: {path}")
            path = str(Path(relative_project_path) / path[2:])
        elif Path(path).is_absolute():
            try:
                path = str(Path(path).resolve().relative_to(Path(self.base_dir).resolve()))
            except ValueError as exc:
                raise ValueError(f"参考素材必须位于当前项目文件树内: {path}") from exc

        return "/" + path.strip("/")

    @staticmethod
    def _format_design_file_dir(file_dir: str) -> str:
        normalized = "/" + str(file_dir or "").strip("/")
        if normalized != "/":
            normalized += "/"
        return normalized

    @staticmethod
    def _drop_empty_values(payload: Dict[str, Any]) -> Dict[str, Any]:
        return {
            key: value
            for key, value in payload.items()
            if value is not None and value != "" and value != [] and value != {}
        }

    def _get_remark_content(self, result: ToolResult, arguments: Dict[str, Any] = None) -> str:
        extra_info = result.extra_info or {}
        return i18n.translate(
            "generate_canvas_videos.summary",
            category="tool.messages",
            completed=extra_info.get("completed_count", 0),
            processing=extra_info.get("processing_count", 0),
            failed=extra_info.get("failed_count", 0),
        )

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: Dict[str, Any] = None,
    ) -> Dict[str, str]:
        if not result.ok:
            return self._handle_design_tool_error(
                result,
                default_action_code="generate_canvas_videos",
                default_success_message_code="generate_canvas_videos.exception",
            )
        return {
            "action": i18n.translate("generate_canvas_videos", category="tool.actions"),
            "remark": self._get_remark_content(result, arguments),
        }

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: Dict[str, Any] = None
    ) -> Optional[ToolDetail]:
        if not result.ok:
            return None
        try:
            from app.core.entity.message.server_message import DesignElementContent

            extra_info = result.extra_info or {}
            return ToolDetail(
                type=DisplayType.DESIGN,
                data=DesignElementContent(
                    type="element",
                    project_path=extra_info.get("project_path", ""),
                    elements=extra_info.get("elements", []),
                ),
            )
        except Exception as e:
            logger.error(f"生成设计视频工具详情失败: {e!s}")
            return None
