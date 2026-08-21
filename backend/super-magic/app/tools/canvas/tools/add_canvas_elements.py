"""新增 Canvas Element 工具。"""

from __future__ import annotations

import math
from typing import Any, Literal, cast

from pydantic import ConfigDict, Field, model_validator

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import ToolDetail
from app.i18n import i18n
from app.tools.canvas.application.commands import (
    AddElementCommand,
    ContentCommand,
    CreationConnectionCommand,
    GenerationParameters,
    LayoutCommand,
)
from app.tools.canvas.domain.content_fields import (
    AudioContentFields,
    ContentFieldsFactory,
    EllipseContentFields,
    ImageContentFields,
    RectangleContentFields,
    StarContentFields,
    StoryboardContentFields,
    TextContentFields,
    TriangleContentFields,
    VideoContentFields,
    VideoEditContentFields,
)
from app.tools.canvas.domain.types import JsonObject
from app.tools.canvas.presentation import (
    CanvasGenerationFeedback,
    CanvasToolDetailBuilder,
    canvas_remark,
    error_result,
    items_content,
)
from app.tools.canvas.tools.agent_write_policy import CanvasAgentWritePolicy
from app.tools.canvas.tools.support import _application
from app.tools.core import BaseToolParams, tool
from app.tools.core.base_tool import BaseTool

CanvasElementType = Literal[
    "text",
    "rectangle",
    "ellipse",
    "triangle",
    "star",
    "image",
    "video",
    "audio",
    "storyboard",
    "video-edit",
]
VideoInputMode = Literal[
    "standard",
    "image_reference",
    "omni_reference",
    "keyframe_guided",
    "video_edit",
]


class CanvasPositionInput(BaseToolParams):
    """显式布局坐标。"""

    model_config = ConfigDict(extra="forbid")

    x: float
    y: float

    @model_validator(mode="after")
    def validate_finite_coordinates(self) -> "CanvasPositionInput":
        """拒绝不能写入 Canvas 的无穷值和非数字值。"""
        if not math.isfinite(self.x) or not math.isfinite(self.y):
            raise ValueError("position.x and position.y must be finite numbers")
        return self


class CanvasLayoutInput(BaseToolParams):
    """新增 Element 使用的确定布局参数。"""

    model_config = ConfigDict(extra="forbid")

    strategy: Literal["row_incremental", "dependency_flow", "explicit_position"]
    position: CanvasPositionInput | None = None

    @model_validator(mode="after")
    def validate_position(self) -> "CanvasLayoutInput":
        """限制显式坐标只用于 explicit_position。"""
        if self.strategy == "explicit_position" and self.position is None:
            raise ValueError("explicit_position requires position")
        if self.strategy != "explicit_position" and self.position is not None:
            raise ValueError("position is only allowed for explicit_position")
        return self

    def to_command(self) -> LayoutCommand:
        """转换为应用层布局命令。"""
        position = (self.position.x, self.position.y) if self.position is not None else None
        return LayoutCommand(strategy=self.strategy, position=position)


class CanvasCreationConnectionInput(BaseToolParams):
    """新增 Element 时使用的确定初始连线参数。"""

    model_config = ConfigDict(extra="forbid")

    source_element_id: str | None = None
    source_item_ref: str | None = None
    target_element_id: str | None = None
    target_item_ref: str | None = None

    @model_validator(mode="after")
    def validate_anchor(self) -> "CanvasCreationConnectionInput":
        """保证每条初始连线只有一个外部锚点。"""
        values = (
            self.source_element_id,
            self.source_item_ref,
            self.target_element_id,
            self.target_item_ref,
        )
        if sum(value is not None for value in values) != 1:
            raise ValueError("each initial connection must provide exactly one source or target reference")
        return self

    def to_command(self) -> CreationConnectionCommand:
        """转换为应用层初始连线命令。"""
        return CreationConnectionCommand(
            source_element_id=self.source_element_id,
            source_item_ref=self.source_item_ref,
            target_element_id=self.target_element_id,
            target_item_ref=self.target_item_ref,
        )


class TextStyleInput(BaseToolParams):
    """富文本字符样式。"""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    font_size: float | None = Field(None, alias="fontSize")
    font_weight: int | str | None = Field(None, alias="fontWeight")
    color: str | None = None
    font_family: str | None = Field(None, alias="fontFamily")
    bold: bool | None = None
    italic: bool | None = None
    underline: bool | None = None
    strikethrough: bool | None = None
    background_color: str | None = Field(None, alias="backgroundColor")
    letter_spacing: float | None = Field(None, alias="letterSpacing")


class ParagraphStyleInput(BaseToolParams):
    """富文本段落样式。"""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    text_align: Literal["left", "center", "right", "justify"] | None = Field(None, alias="textAlign")
    line_height: float | None = Field(None, gt=0, alias="lineHeight")


class RichTextNodeInput(BaseToolParams):
    """富文本字符节点。"""

    model_config = ConfigDict(extra="forbid")

    type: Literal["text"] = "text"
    text: str
    style: TextStyleInput | None = None


class RichTextParagraphInput(BaseToolParams):
    """富文本段落。"""

    model_config = ConfigDict(extra="forbid")

    children: list[RichTextNodeInput] = Field(default_factory=list)
    style: ParagraphStyleInput | None = None


class StoryboardGenerationConfigInput(BaseToolParams):
    """分镜统一生成配置。"""

    model_config = ConfigDict(extra="forbid")

    model_id: str | None = None
    size: str | None = None
    resolution: str | None = None
    aspect_ratio: str | None = None


class StoryboardShotInput(BaseToolParams):
    """单个分镜镜头。"""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: str = Field(..., min_length=1)
    description: str = Field(..., min_length=1)
    output_image_element_id: str | None = Field(None, alias="outputImageElementId")


class VideoEditOutputInput(BaseToolParams):
    """视频剪辑输出配置。"""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    aspect_ratio: str | None = Field(None, alias="aspectRatio")
    resolution: str | None = None
    format: Literal["mp4"] = "mp4"


class ContentInput(BaseToolParams):
    """Canvas 工具公开的确定 Content 输入。"""

    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        json_schema_extra={
            "examples": [
                {"source": "user", "content_type": "text", "content": "标题文本"},
                {
                    "source": "generated",
                    "content_type": "image",
                    "prompt": "产品主视觉",
                    "name": "深蓝香水瓶主视觉",
                },
                {"source": "generated", "content_type": "video", "prompt": "产品动态展示"},
                {
                    "source": "imported",
                    "content_type": "image",
                    "asset_path": "Canvas/Demo/images/hero.png",
                },
            ]
        },
    )

    source: Literal["user", "imported", "generated"]
    content_type: CanvasElementType
    content: str | list[RichTextParagraphInput] | None = None
    asset_path: str | None = Field(
        None,
        min_length=1,
        description="""<!--zh: imported 媒体的工作区路径。如果文件不在当前 Canvas 项目的标准媒体目录，工具会自动复制并在结果中返回项目内路径。-->
Workspace path of imported media. When the file is outside the current Canvas project's canonical media directory, the tool copies it into the project and returns the project-local path.""",
    )
    prompt: str | None = Field(None, min_length=1)
    default_style: TextStyleInput | None = Field(None, alias="defaultStyle")
    fill: str | None = None
    stroke: str | None = None
    stroke_width: float | None = Field(None, alias="strokeWidth")
    corner_radius: float | None = Field(None, alias="cornerRadius")
    sides: int | None = Field(None, ge=2)
    inner_radius_ratio: float | None = Field(None, gt=0, le=1, alias="innerRadiusRatio")
    generation_config: StoryboardGenerationConfigInput | None = Field(None, alias="generationConfig")
    shots: list[StoryboardShotInput] | None = None
    video_sequence: list[str] | None = Field(None, alias="videoSequence")
    audio_sequence: list[str] | None = Field(None, alias="audioSequence")
    output: VideoEditOutputInput | None = None
    model_id: str | None = None
    estimate_id: str | None = None
    name: str | None = Field(
        None,
        min_length=1,
        description="""<!--zh: 生成媒体的文件名由大模型根据最终内容命名。生成图片时必填，与用户语言一致，建议使用 3-5 个词；系统会清洗名称并追加时间戳。-->
Model-provided output name for generated media. Required for generated images; describe the actual result in the user's language with 3-5 words. The system sanitizes it and appends a timestamp.""",
    )
    reference_images: list[str] = Field(
        default_factory=list,
        description="""<!--zh: 当前 Canvas 项目内的参考图片路径，必须使用相对于当前 magic.project.js 的路径，并以 ./ 开头，例如 ./images/reference.jpg。-->
Reference image paths inside the current Canvas project. Use paths relative to the current magic.project.js and always prefix them with ./, for example ./images/reference.jpg.""",
    )
    reference_image_paths: list[str] = Field(default_factory=list)
    reference_video_paths: list[str] = Field(default_factory=list)
    reference_audio_paths: list[str] = Field(default_factory=list)
    frame_start_path: str | None = None
    frame_end_path: str | None = None
    input_mode: VideoInputMode | None = None
    task: Literal["generate", "edit"] | None = None
    size: str | None = None
    duration_seconds: int | None = Field(None, gt=0)
    aspect_ratio: str | None = None
    resolution: str | None = None
    fps: int | None = Field(None, gt=0)
    seed: int | None = None
    watermark: bool | None = None

    @model_validator(mode="after")
    def validate_content_contract(self) -> "ContentInput":
        """按来源和 Content 类型拒绝不确定字段组合。"""
        if self.source == "generated":
            if self.content_type not in {"image", "video"}:
                raise ValueError("source=generated currently supports content_type=image or video")
            if not self.prompt:
                raise ValueError("source=generated requires prompt")
            if self.content_type == "image" and (not self.name or not self.name.strip()):
                raise ValueError("source=generated image requires name")
            if self.asset_path is not None:
                raise ValueError("asset_path is only allowed when source=imported")
        elif self.source == "imported":
            if self.content_type not in {"image", "video", "audio"}:
                raise ValueError("source=imported requires content_type=image, video, or audio")
            if not self.asset_path:
                raise ValueError("source=imported requires asset_path")
            if self.prompt is not None:
                raise ValueError("prompt is only allowed when source=generated")
        else:
            if self.content_type in {"image", "video", "audio"}:
                raise ValueError("media Content must use source=imported or source=generated")
            if self.asset_path is not None or self.prompt is not None:
                raise ValueError("user Content does not accept asset_path or prompt")
        if self.task == "edit" and self.content_type != "video":
            raise ValueError("task=edit is only allowed for generated video Content")
        return self

    def to_command(self, content_id: str | None = None) -> ContentCommand:
        """转换为应用层 Content 命令。"""
        return ContentCommand(
            source=self.source,
            content_type=self.content_type,
            fields=self._build_fields(),
            asset_path=self.asset_path,
            generation_parameters=self._build_generation_parameters() if self.source == "generated" else None,
            content_id=content_id,
        )

    def _build_fields(self):
        """按确定的 Content 类型构造领域字段。"""
        if self.content_type == "image":
            return ImageContentFields()
        if self.content_type == "video":
            return VideoContentFields()
        if self.content_type == "audio":
            return AudioContentFields()
        if self.content_type == "text":
            return TextContentFields(
                content=self._text_paragraphs(),
                default_style=self._model_object(self.default_style),
            )
        if self.content_type == "rectangle":
            return RectangleContentFields(
                fill=self.fill,
                stroke=self.stroke,
                stroke_width=self.stroke_width,
                corner_radius=self.corner_radius,
            )
        if self.content_type == "ellipse":
            return EllipseContentFields(fill=self.fill, stroke=self.stroke, stroke_width=self.stroke_width)
        if self.content_type == "triangle":
            return TriangleContentFields(fill=self.fill, stroke=self.stroke, stroke_width=self.stroke_width)
        if self.content_type == "star":
            return StarContentFields(
                fill=self.fill,
                stroke=self.stroke,
                stroke_width=self.stroke_width,
                corner_radius=self.corner_radius,
                sides=self.sides,
                inner_radius_ratio=self.inner_radius_ratio,
            )
        if self.content_type == "storyboard":
            return StoryboardContentFields(
                generation_config=self._model_object(self.generation_config),
                shots=[self._model_object(shot) for shot in self.shots or []],
            )
        if self.content_type == "video-edit":
            return VideoEditContentFields(
                video_sequence=list(self.video_sequence or []),
                audio_sequence=list(self.audio_sequence or []),
                output=self._model_object(self.output),
            )
        return ContentFieldsFactory.empty(self.content_type)

    def _build_generation_parameters(self) -> GenerationParameters:
        """构造不包含开放扩展字典的生成参数。"""
        return GenerationParameters(
            prompt=self.prompt or "",
            model_id=self.model_id,
            estimate_id=self.estimate_id,
            name=self.name,
            size=self.size,
            reference_images=tuple(self.reference_images),
            reference_image_paths=tuple(self.reference_image_paths),
            reference_video_paths=tuple(self.reference_video_paths),
            reference_audio_paths=tuple(self.reference_audio_paths),
            frame_start_path=self.frame_start_path,
            frame_end_path=self.frame_end_path,
            input_mode=self.input_mode,
            task=self.task,
            duration_seconds=self.duration_seconds,
            aspect_ratio=self.aspect_ratio,
            resolution=self.resolution,
            fps=self.fps,
            seed=self.seed,
            watermark=self.watermark,
        )

    def _text_paragraphs(self) -> list[JsonObject]:
        """把文本简写或富文本段落转换为协议对象。"""
        if isinstance(self.content, str):
            return [{"children": [{"type": "text", "text": self.content}]}]
        return [cast(JsonObject, paragraph.model_dump(by_alias=True, exclude_none=True)) for paragraph in self.content or []]

    @staticmethod
    def _model_object(model: BaseToolParams | None) -> JsonObject | None:
        """把确定的嵌套输入模型转换为领域 JSON 对象。"""
        if model is None:
            return None
        return cast(JsonObject, model.model_dump(by_alias=True, exclude_none=True))


class ElementInput(BaseToolParams):
    """单个新增 Element 参数。"""

    model_config = ConfigDict(extra="forbid")

    item_ref: str = Field(..., min_length=1)
    element_type: CanvasElementType = Field(
        ...,
        description="""<!--zh: Agent 只能创建 storyboard、video-edit、image、video、audio；Frame 请使用 frame_canvas_elements。其他类型只允许读取。-->
The Canvas Agent may create only storyboard, video-edit, image, video, and audio Elements. Create Frames with frame_canvas_elements. All other Element types are read-only.""",
    )
    name: str | None = None
    layout: CanvasLayoutInput | None = None
    content: ContentInput | None = None
    connections: list[CanvasCreationConnectionInput] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_content_type(self) -> "ElementInput":
        """保证 Element 与 Content 类型完全一致。"""
        if self.content is not None and self.content.content_type != self.element_type:
            raise ValueError("content.content_type must match element_type")
        return self

    def to_command(self) -> AddElementCommand:
        """转换为应用层新增 Element 命令。"""
        return AddElementCommand(
            item_ref=self.item_ref,
            element_type=self.element_type,
            name=self.name,
            layout=self.layout.to_command() if self.layout else None,
            content=self.content.to_command() if self.content else None,
            connections=tuple(connection.to_command() for connection in self.connections),
        )


@tool(name="add_canvas_elements", code_mode_only=True)
class AddCanvasElements(BaseTool[BaseToolParams]):
    """<!--zh: 新增 Canvas Element。-->Add Canvas Elements."""

    name = "add_canvas_elements"
    feedback_action_key = "canvas.add_elements"

    class Params(BaseToolParams):
        """批量新增 Element 参数。"""

        model_config = ConfigDict(extra="forbid")

        project_path: str = Field(..., min_length=1, description="Workspace-relative Canvas project path.")
        items: list[ElementInput] = Field(..., min_length=1)

    params_class = Params

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: dict[str, Any] | None = None
    ) -> dict[str, str]:
        """生成新增 Element 前的批量操作反馈。"""
        args = arguments or {}
        generation_summary = CanvasGenerationFeedback.from_arguments(args)
        if CanvasGenerationFeedback.is_pure_generated_batch(args):
            return {
                "action": i18n.translate(
                    CanvasGenerationFeedback.action_key(generation_summary, pending=True),
                    category="tool.actions",
                ),
                "remark": CanvasGenerationFeedback.remark(generation_summary, pending=True),
                "tool_name": tool_name,
            }
        items = args.get("items") or []
        sources = {
            str(item.get("content", {}).get("source"))
            for item in items
            if isinstance(item, dict) and isinstance(item.get("content"), dict)
        }
        action_key = "canvas.add_generated_content" if sources == {"generated"} else (
            "canvas.import_content" if sources == {"imported"} else self.feedback_action_key
        )
        project_path = args.get("project_path", "")
        remark = canvas_remark("canvas.add_elements_pending", project_path, total=len(items))
        return {
            "action": i18n.translate(action_key, category="tool.actions"),
            "remark": remark,
            "tool_name": tool_name,
        }

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: dict[str, Any] | None = None,
    ) -> dict[str, str]:
        """生成新增 Element 后的逐项结果反馈。"""
        generation_summary = CanvasGenerationFeedback.from_arguments(arguments)
        if not result.ok:
            if CanvasGenerationFeedback.is_pure_generated_batch(arguments):
                return {
                    "action": i18n.translate(
                        CanvasGenerationFeedback.action_key(generation_summary),
                        category="tool.actions",
                    ),
                    "remark": CanvasGenerationFeedback.failure_remark(generation_summary),
                }
            remark = i18n.translate("canvas.operation_failed", category="tool.messages")
        else:
            values = (result.data or {}).get("items", [])
            generation_summary = CanvasGenerationFeedback.from_result(result, arguments)
            if CanvasGenerationFeedback.is_pure_generated_batch(arguments) and generation_summary.is_supported:
                return {
                    "action": i18n.translate(
                        CanvasGenerationFeedback.action_key(generation_summary),
                        category="tool.actions",
                    ),
                    "remark": CanvasGenerationFeedback.remark(generation_summary),
                }
            succeeded = sum(
                1
                for item in values
                if item.get("status") in {"added", "completed", "pending", "processing"}
            )
            remark = canvas_remark("canvas.add_elements_result", succeeded=succeeded, total=len(values))
        args = arguments or {}
        sources = {
            str(item.get("content", {}).get("source"))
            for item in args.get("items", [])
            if isinstance(item, dict) and isinstance(item.get("content"), dict)
        }
        action_key = "canvas.add_generated_content" if sources == {"generated"} else (
            "canvas.import_content" if sources == {"imported"} else self.feedback_action_key
        )
        return {
            "action": i18n.translate(action_key, category="tool.actions"),
            "remark": remark,
        }

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: dict[str, Any] | None = None
    ) -> ToolDetail | None:
        """生成新增 Element 自己的逐项详情。"""
        data = result.data or {}
        generation_summary = CanvasGenerationFeedback.from_result(result, arguments)
        is_generation_batch = (
            CanvasGenerationFeedback.is_pure_generated_batch(arguments) and generation_summary.is_supported
        )
        title_key = (
            CanvasGenerationFeedback.detail_title_key(generation_summary)
            if is_generation_batch
            else "elements_added"
        )
        builder = CanvasToolDetailBuilder(self.name, title_key, result, arguments)
        builder.add_field("project_path", data.get("project_path") or builder.arguments.get("project_path") or "-")
        if is_generation_batch:
            builder.add_field("media_type", generation_summary.media_label())
            for media_type in generation_summary.media_types:
                counts = generation_summary.by_type[media_type]
                builder.add_item(
                    {
                        "media_type": CanvasGenerationFeedback.media_label_for_type(media_type),
                        "total": counts.total,
                        "completed": counts.completed,
                        "processing": counts.processing,
                        "failed": counts.failed,
                    }
                )
        for item in data.get("items", []):
            media_type = CanvasGenerationFeedback.media_type_for_item(item, arguments)
            builder.add_item(
                {
                    "item_ref": item.get("item_ref", "-"),
                    "status": item.get("status", "-"),
                    "element_id": item.get("element_id", "-"),
                    "type": item.get("element_type", "-"),
                    **({"media_type": CanvasGenerationFeedback.media_label_for_type(media_type)} if media_type else {}),
                }
            )
        return builder.build()

    async def execute(self, tool_context: ToolContext, params: Params) -> ToolResult:
        """创建一批 Element，并按 item 返回真实标识。"""
        try:
            commands = [item.to_command() for item in params.items]
            CanvasAgentWritePolicy.validate_creation(commands)
            result = await _application(tool_context).add_elements(
                params.project_path,
                commands,
                tool_context=tool_context,
            )
            return ToolResult(
                content=items_content(
                    "Canvas Elements added successfully.",
                    result.to_dict(),
                    "call query_canvas_element_details with the returned element_id values to verify the persisted Elements",
                ),
                data=result.to_dict(),
            )
        except Exception as error:
            return error_result(error)
