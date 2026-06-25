"""AI 视频生成并添加到画布工具（任务列表版）

每个 task 独立指定 prompt / name / size，
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
from app.infrastructure.magic_service.design_video_client import (
    DesignVideoClient,
    DesignVideoServiceError,
)
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

VIDEO_TASK_ALIASES = {
    "generater": "generate",
    "generator": "generate",
}
VIDEO_INPUT_MODE_ALIASES = {
    "video_editing": "video_edit",
}


def _parse_dimension_size(value: str) -> tuple[int, int] | None:
    match = re.fullmatch(r"\s*(\d+)\s*[xX]\s*(\d+)\s*", value or "")
    if not match:
        return None
    return int(match.group(1)), int(match.group(2))


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
        description="""<!--zh: 视频生成提示词。素材路径不要写在这里；有参考素材时，在 prompt 中按数组顺序写 [image1] / [video1] / [audio1]。-->
Video generation prompt. Do not put asset paths here. When using reference assets, cite them by list order with [image1] / [video1] / [audio1]."""
    )
    name: str = Field(
        ...,
        description="""<!--zh: 画布元素名称，应反映具体内容，不要用大类或编号替代。-->
Canvas element label. Must reflect the specific content of this video — not a generic category or numbered slot."""
    )
    size: str = Field(
        ...,
        description="""<!--zh: 视频生成尺寸，必填，字段名必须是 size。例如 1280x720、1920x1080、2160x3840。它控制底层视频生成尺寸；画布展示宽高也由该值自动推导，不要再传 width/height。-->
Video generation size, required. The parameter name must be size, e.g. 1280x720, 1920x1080, 2160x3840. It controls the underlying generated video dimensions; canvas display width/height are derived from it automatically. Do not pass width/height."""
    )
    aspect_ratio: str = Field(
        "",
        description="""<!--zh: 生成视频宽高比，可选，例如 16:9、9:16、1:1。它控制生成比例，不控制画布展示大小。若 size 已经明确表达尺寸，除非用户明确要求，否则可以不传 aspect_ratio。-->
Generated video aspect ratio, optional, e.g. 16:9, 9:16, 1:1. It controls generation ratio, not canvas layout size. If size already defines dimensions, omit aspect_ratio unless the user explicitly asks for it."""
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
        description="""<!--zh: 参考图路径或 URL 列表。字段名必须是 reference_image_paths。prompt 中按顺序用 [image1]、[image2] 引用。-->
Reference image path or URL list. Must be reference_image_paths. Cite by list order in prompt as [image1], [image2], etc."""
    )
    reference_video_paths: List[str] = Field(
        default_factory=list,
        description="""<!--zh: 参考视频路径或 URL 列表。字段名必须是 reference_video_paths。prompt 中按顺序用 [video1]、[video2] 引用。-->
Reference video path or URL list. Must be reference_video_paths. Cite by list order in prompt as [video1], [video2], etc."""
    )
    reference_audio_paths: List[str] = Field(
        default_factory=list,
        description="""<!--zh: 参考音频路径或 URL 列表。字段名必须是 reference_audio_paths。prompt 中按顺序用 [audio1]、[audio2] 引用。-->
Reference audio path or URL list. Must be reference_audio_paths. Cite by list order in prompt as [audio1], [audio2], etc."""
    )
    frame_start_path: str = Field(
        "",
        description="""<!--zh: 起始帧图片路径或 URL。字段名必须是 frame_start_path。不要使用 start_frame。-->
Start frame image path or URL. The parameter name must be frame_start_path. Do not use start_frame."""
    )
    frame_end_path: str = Field(
        "",
        description="""<!--zh: 结束帧图片路径或 URL。字段名必须是 frame_end_path。不要使用 end_frame。-->
End frame image path or URL. The parameter name must be frame_end_path. Do not use end_frame."""
    )
    duration_seconds: Optional[int] = Field(
        default=None,
        description="""<!--zh: 视频时长（秒），可选。字段名必须是 duration_seconds。不要使用 duration。示例：4 秒传 duration_seconds=4。-->
Video duration in seconds, optional. The parameter name must be duration_seconds. Do not use duration. Example: pass duration_seconds=4 for a 4-second video."""
    )
    resolution: str = Field(
        "",
        description="""<!--zh: 视频清晰度档位，可选，字段名必须是 resolution。常见值：720p、1080p、4k。不要把 1280x720 这种尺寸传到 resolution；尺寸请用 size。-->
Video quality/resolution tier, optional. The parameter name must be resolution. Common values: 720p, 1080p, 4k. Do not pass dimensions like 1280x720 here; use size for dimensions."""
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

        # width/height used to be public canvas fields. They are now derived from size.
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

    @field_validator("size")
    @classmethod
    def validate_size(cls, value: str) -> str:
        if not isinstance(value, str) or not value.strip():
            raise ValueError("size is required and must use WIDTHxHEIGHT format, for example 1280x720")
        if _parse_dimension_size(value) is None:
            raise ValueError(f"Invalid size format: '{value}'. Use WIDTHxHEIGHT, for example 1280x720")
        return value.strip()

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
        dimensions = _parse_dimension_size(self.size)
        if dimensions is None:
            raise ValueError(f"Invalid size format: '{self.size}'. Use WIDTHxHEIGHT, for example 1280x720")
        return dimensions


class GenerateCanvasVideosParams(BaseToolParams):
    """generate_canvas_videos 工具参数"""

    project_path: str = Field(
        ...,
        description="""<!--zh: 设计项目的相对路径（包含 magic.project.js 的文件夹）-->
Relative path to the design project (folder containing magic.project.js)"""
    )
    tasks: List[VideoTaskSpec] = Field(
        ...,
        description="""<!--zh: 视频生成任务列表，每个 task 生成一个视频，最多 4 个。每个 task 必须包含 prompt / name / size。size 使用 WIDTHxHEIGHT 格式，同时用于底层视频生成尺寸和画布展示宽高推导；不要再传 width/height。其他字段必须使用本 schema 中的精确字段名。常见正确字段：duration_seconds（不是 duration）、reference_image_paths（不是 images/image）、reference_video_paths（不是 videos/video）、frame_start_path（不是 start_frame）、frame_end_path（不是 end_frame）。使用参考素材时，prompt 必须用 [image1] / [video1] / [audio1] 按数组顺序绑定素材。示例：tasks=[{"prompt":"白色长毛小猫 [image1] 从黑色箱子里探头钻出，黑色短毛小猫 [image2] 从白色箱子里跳出来，橘色虎斑小猫 [image3] 从黄色箱子里爬出。","name":"三色箱子猫咪跳出","size":"1280x720","duration_seconds":4,"resolution":"720p","reference_image_paths":["images/cat1.png","images/cat2.png","images/cat3.png"]}]-->
Video generation task list. Each task produces one video. Maximum 4 tasks per call. Each task must include prompt, name, and size. size uses WIDTHxHEIGHT format and is used both for generation dimensions and derived canvas display dimensions. Do not pass width/height. Optional fields must use the exact schema names: duration_seconds (not duration), reference_image_paths (not images/image), reference_video_paths (not videos/video), frame_start_path (not start_frame), frame_end_path (not end_frame). When using reference assets, the prompt must bind them by list order with [image1] / [video1] / [audio1]. Example: tasks=[{"prompt":"White long-haired kitten [image1] peeks out of the black box, black short-haired kitten [image2] jumps out of the white box, orange tabby kitten [image3] climbs out of the yellow box.","name":"three_color_box_cats","size":"1280x720","duration_seconds":4,"resolution":"720p","reference_image_paths":["images/cat1.png","images/cat2.png","images/cat3.png"]}]"""
    )
    model_id: str = Field("", description="<!--zh: 可选视频模型 ID，所有任务共用-->Optional video model ID, shared across all tasks")
    override: bool = Field(False, description="<!--zh: 是否覆盖已有文件-->Whether to override existing files")

    @model_validator(mode="before")
    @classmethod
    def validate_task_sizes(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value

        tasks = value.get("tasks")
        if not isinstance(tasks, list):
            return value

        missing_fields = []
        for index, task in enumerate(tasks):
            if not isinstance(task, dict):
                continue
            if task.get("size") in (None, ""):
                missing_fields.append(f"tasks.{index}.size")

        if missing_fields:
            raise ValueError(
                "generate_canvas_videos requires size for every task because it defines both "
                "the video generation dimensions and the canvas display size. Missing fields: "
                f"{', '.join(missing_fields)}. "
                "Use WIDTHxHEIGHT format, e.g. size='1280x720'."
            )

        return value

    @classmethod
    def get_custom_error_message(cls, field_name: str, error_type: str) -> str | None:
        if error_type == "extra_forbidden" and field_name == "tasks":
            return (
                "generate_canvas_videos 的 tasks 中存在未定义参数。"
                "请只使用 task schema 里的精确字段名：prompt, name, size, aspect_ratio, input_mode, task, "
                "reference_image_paths, reference_video_paths, reference_audio_paths, frame_start_path, "
                "frame_end_path, duration_seconds, resolution, fps, seed, watermark, extensions, element_id。"
                "常见改名：duration -> duration_seconds；images/image/reference_images -> reference_image_paths；"
                "videos/video/reference_videos -> reference_video_paths；start_frame -> frame_start_path；"
                "end_frame -> frame_end_path。"
                "正确示例：tasks=[{'prompt':'白色长毛小猫 [image1] 从黑色箱子里探头钻出，"
                "黑色短毛小猫 [image2] 从白色箱子里跳出来，橘色虎斑小猫 [image3] 从黄色箱子里爬出。', "
                "'name':'三色箱子猫咪跳出', "
                "'size':'1280x720', 'duration_seconds':4, 'resolution':'720p', "
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
    """<!--zh: 按任务列表生成 AI 视频并自动添加到画布。每个 task 独立指定提示词和 size，有几个 task 就生成几个视频，并发执行。-->
    Generate AI videos and automatically add them to the canvas, one video per task. Each task independently specifies its prompt and size; all tasks run concurrently.
    """

    # 视频每行最多 4 个（与任务上限一致）
    _max_elements_per_row: int = 4

    def __init__(self, **data):
        super().__init__(**data)
        self._design_video_client: Optional[DesignVideoClient] = None
        self._task_video_ids: Dict[int, str] = {}
        # 全局参数缓存，在 execute() 中写入，供 _prepare_task_kwargs / _execute_task_item 读取
        self._model_id: str = ""
        self._override: bool = False

    async def execute(self, tool_context: ToolContext, params: GenerateCanvasVideosParams) -> ToolResult:
        try:
            logger.info(
                f"开始执行设计生视频: {_format_tool_context_for_log(tool_context)} "
                f"project_path={params.project_path} tasks={len(params.tasks)}"
            )
            # 缓存全局参数（单事件循环语义下安全）
            self._model_id = params.model_id
            self._override = params.override
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
        resolved_output_path: str = "",
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
                f"size={payload.get('generation', {}).get('size') or ''}"
            )
            response = await self._get_design_video_client().generate_video(payload)
        except (DesignVideoServiceError, ValueError) as error:
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
        resolved_output_path = str(relative_project_path / "videos")
        design_file_dir = self._format_design_file_dir(str(relative_project_path / "videos"))
        project_id = self._resolve_project_id()
        await async_mkdir(project_path / "videos", parents=True, exist_ok=True)
        await self._get_design_video_client().ensure_project_directory(project_id, design_file_dir)
        return {
            "resolved_output_path": resolved_output_path,
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
        pending_operations = [
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
        processing_count = len(pending_operations)
        failed_count = sum(1 for r in task_results if r.is_failed)
        return {
            "completed_count": completed_count,
            "processing_count": processing_count,
            "failed_count": failed_count,
            "pending_operations": pending_operations,
        }

    # ------------------------------------------------------------------
    # 私有辅助
    # ------------------------------------------------------------------

    def _get_design_video_client(self) -> DesignVideoClient:
        if self._design_video_client is None:
            self._design_video_client = DesignVideoClient()
        return self._design_video_client

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
        payload: Dict[str, Any] = {
            "video_id": video_id,
            "model_id": self._model_id or None,
            "prompt": task.prompt,
            "input_mode": task.input_mode or None,
            "task": task.task or "generate",
        }
        generation = self._build_design_generation(task)
        if generation:
            payload["generation"] = generation
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
        payload: Dict[str, Any] = {
            "project_id": project_id,
            "video_id": video_id,
            "model_id": model_id,
            "prompt": task.prompt,
            "input_mode": task.input_mode or None,
            "task": task.task or "generate",
            "file_dir": self._format_design_file_dir(file_dir),
        }

        inputs = self._build_design_video_inputs(task, relative_project_path)
        if inputs:
            payload["inputs"] = inputs

        generation = self._build_design_generation(task)
        if generation:
            payload["generation"] = generation

        if task.extensions:
            payload["extensions"] = dict(task.extensions)

        return self._drop_empty_values(payload)

    def _build_design_video_inputs(
        self,
        task: VideoTaskSpec,
        relative_project_path: str,
    ) -> Dict[str, Any]:
        inputs: Dict[str, Any] = {}
        if task.reference_image_paths:
            inputs["reference_images"] = [
                {"uri": self._to_design_workspace_path(path, relative_project_path)}
                for path in task.reference_image_paths
            ]
        if task.reference_video_paths:
            inputs["reference_videos"] = [
                {"uri": self._to_design_workspace_path(path, relative_project_path)}
                for path in task.reference_video_paths
            ]
        if task.reference_audio_paths:
            inputs["reference_audios"] = [
                {"uri": self._to_design_workspace_path(path, relative_project_path)}
                for path in task.reference_audio_paths
            ]

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
        if frames:
            inputs["frames"] = frames

        return inputs

    @staticmethod
    def _build_design_generation(task: VideoTaskSpec) -> Dict[str, Any]:
        generation: Dict[str, Any] = {
            "size": task.size or None,
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
