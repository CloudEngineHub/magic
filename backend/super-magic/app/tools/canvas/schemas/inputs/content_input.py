"""ContentInput 输入模型。"""

from __future__ import annotations

import math
from typing import Literal, cast

from pydantic import ConfigDict, Field, model_validator

from app.tools.core import BaseToolParams
from app.tools.canvas.application.commands import ContentCommand, GenerationParameters
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
from app.tools.canvas.domain.types import JsonObject, JsonValue
from app.tools.canvas.schemas.inputs.rich_text_input import RichTextParagraphInput, TextStyleInput
from app.tools.canvas.schemas.inputs.storyboard_input import StoryboardGenerationConfigInput, StoryboardShotInput
from app.tools.canvas.schemas.inputs.video_edit_input import VideoEditOutputInput


class ContentInput(BaseToolParams):
    """统一且便于模型填写的 Content 输入。"""

    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        json_schema_extra={
            "examples": [
                {"source": "user", "content_type": "text", "content": "标题文本"},
                {"source": "generated", "content_type": "image", "prompt": "产品主视觉"},
                {"source": "generated", "content_type": "video", "prompt": "产品动态展示"},
                {
                    "source": "imported",
                    "content_type": "image",
                    "asset_path": "Canvas/Demo/images/hero.png",
                },
            ]
        },
    )
    source: Literal["user", "imported", "generated"] = Field(
        ...,
        description="Content source: user, imported, or generated.",
    )
    content_type: Literal[
        "image",
        "video",
        "audio",
        "text",
        "rectangle",
        "ellipse",
        "triangle",
        "star",
        "storyboard",
        "video-edit",
    ] = Field(..., description="Content type; it must match the target Element type.")
    content: str | list[RichTextParagraphInput] | None = Field(
        None,
        description=(
            "User Content payload. For a text node, pass the text string here, "
            "for example content='标题'."
        ),
    )
    asset_path: str | None = Field(
        None,
        min_length=1,
        description="Existing workspace-relative media path; required only when source=imported.",
    )
    prompt: str | None = Field(
        None,
        min_length=1,
        description="Generation prompt; required only when source=generated.",
    )
    default_style: TextStyleInput | None = Field(None, alias="defaultStyle")
    fill: str | None = None
    stroke: str | None = None
    stroke_width: float | None = Field(None, alias="strokeWidth")
    corner_radius: float | None = Field(None, alias="cornerRadius")
    sides: int | None = None
    inner_radius_ratio: float | None = Field(None, alias="innerRadiusRatio")
    generation_config: StoryboardGenerationConfigInput | None = Field(None, alias="generationConfig")
    shots: list[StoryboardShotInput] | None = None
    video_sequence: list[str] | None = Field(None, alias="videoSequence")
    output: VideoEditOutputInput | None = None
    model_id: str | None = None
    name: str | None = None
    reference_images: list[str] = Field(default_factory=list)
    reference_image_paths: list[str] = Field(default_factory=list)
    reference_video_paths: list[str] = Field(default_factory=list)
    reference_audio_paths: list[str] = Field(default_factory=list)
    frame_start_path: str | None = None
    frame_end_path: str | None = None
    size: str | None = None
    duration_seconds: int | None = Field(None, gt=0)
    aspect_ratio: str | None = None
    resolution: str | None = None
    fps: int | None = Field(None, gt=0)
    seed: int | None = None
    watermark: bool | None = None
    extensions: JsonObject = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_source_fields(self) -> "ContentInput":
        """按来源校验必要字段，向模型返回单一且明确的错误。"""
        if self.source == "generated":
            if self.content_type not in {"image", "video"}:
                raise ValueError("source=generated currently supports content_type=image or video")
            if not self.prompt:
                raise ValueError("source=generated requires prompt")
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
        return self

    def to_command(self, content_id: str | None = None) -> ContentCommand:
        """把大模型输入转换为 Application 使用的强类型 Content 命令。"""
        fields = self._build_fields()
        generation_parameters = self._build_generation_parameters() if self.source == "generated" else None
        return ContentCommand(
            source=self.source,
            content_type=self.content_type,
            fields=fields,
            asset_path=self.asset_path,
            generation_parameters=generation_parameters,
            content_id=content_id,
        )

    def _build_fields(self):
        """按 content_type 构造确定的 Content Fields。"""
        if self.content_type == "image":
            return ImageContentFields()
        if self.content_type == "video":
            return VideoContentFields()
        if self.content_type == "audio":
            return AudioContentFields()
        if self.content_type == "text":
            paragraphs = self._text_paragraphs()
            return TextContentFields(
                content=paragraphs,
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
            return EllipseContentFields(
                fill=self.fill,
                stroke=self.stroke,
                stroke_width=self.stroke_width,
            )
        if self.content_type == "triangle":
            return TriangleContentFields(
                fill=self.fill,
                stroke=self.stroke,
                stroke_width=self.stroke_width,
            )
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
                output=self._model_object(self.output),
            )
        return ContentFieldsFactory.empty(self.content_type)

    def _build_generation_parameters(self) -> GenerationParameters:
        """构造生成策略使用的强类型参数。"""
        return GenerationParameters(
            prompt=self.prompt or "",
            model_id=self.model_id,
            name=self.name,
            size=self.size,
            reference_images=tuple(self.reference_images),
            reference_image_paths=tuple(self.reference_image_paths),
            reference_video_paths=tuple(self.reference_video_paths),
            reference_audio_paths=tuple(self.reference_audio_paths),
            frame_start_path=self.frame_start_path,
            frame_end_path=self.frame_end_path,
            duration_seconds=self.duration_seconds,
            aspect_ratio=self.aspect_ratio,
            resolution=self.resolution,
            fps=self.fps,
            seed=self.seed,
            watermark=self.watermark,
            extensions=self.extensions,
        )

    def _text_paragraphs(self) -> list[JsonObject]:
        """把便于模型填写的字符串或段落输入转换为协议段落。"""
        if isinstance(self.content, str):
            return [{"children": [{"type": "text", "text": self.content}]}]
        return [cast(JsonObject, paragraph.model_dump(by_alias=True, exclude_none=True)) for paragraph in self.content or []]

    @staticmethod
    def _model_object(model: BaseToolParams | TextStyleInput | StoryboardGenerationConfigInput | StoryboardShotInput | VideoEditOutputInput | None) -> JsonObject | None:
        """把嵌套输入模型转换为 JSON 对象。"""
        if model is None:
            return None
        return cast(JsonObject, model.model_dump(by_alias=True, exclude_none=True))
