"""Canvas 工具面向大模型的强类型输入。"""

from __future__ import annotations

import math
from typing import Any, Literal

from pydantic import ConfigDict, Field, model_validator

from app.tools.core import BaseToolParams


class ProjectPathParams(BaseToolParams):
    """公共项目路径参数。"""

    project_path: str = Field(..., min_length=1, description="Workspace-relative Canvas project path.")


class ElementIdParams(ProjectPathParams):
    """精确 Element 查询参数。"""

    element_ids: list[str] = Field(
        ...,
        min_length=1,
        max_length=10,
        description="Exact Element IDs obtained from a Canvas result.",
    )


class LayoutInput(BaseToolParams):
    """可插拔布局策略参数。"""

    model_config = ConfigDict(extra="forbid")
    strategy: Literal["row_incremental", "dependency_flow", "explicit_position"]
    position: dict[str, float] | None = None

    @model_validator(mode="after")
    def validate_position(self) -> "LayoutInput":
        """限制显式坐标只出现在显式布局策略中。"""
        if self.strategy == "explicit_position" and (
            self.position is None or not {"x", "y"}.issubset(self.position)
        ):
            raise ValueError("explicit_position requires position.x and position.y")
        if self.strategy != "explicit_position" and self.position is not None:
            raise ValueError("position is only allowed for explicit_position")
        if self.position is not None and any(not math.isfinite(value) for value in self.position.values()):
            raise ValueError("position values must be finite numbers")
        return self


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
    content: Any | None = Field(
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
    default_style: dict[str, Any] | None = Field(None, alias="defaultStyle")
    fill: Any | None = None
    stroke: Any | None = None
    stroke_width: float | None = Field(None, alias="strokeWidth")
    corner_radius: float | None = Field(None, alias="cornerRadius")
    sides: int | None = None
    inner_radius_ratio: float | None = Field(None, alias="innerRadiusRatio")
    generation_config: dict[str, Any] | None = Field(None, alias="generationConfig")
    shots: list[dict[str, Any]] | None = None
    video_sequence: list[dict[str, Any]] | None = Field(None, alias="videoSequence")
    output: dict[str, Any] | None = None
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
    extensions: dict[str, Any] = Field(default_factory=dict)

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


class CreationConnectionInput(BaseToolParams):
    """新增节点时以当前节点为锚点的初始连线。"""

    model_config = ConfigDict(extra="forbid")
    source_element_id: str | None = None
    source_item_ref: str | None = None
    target_element_id: str | None = None
    target_item_ref: str | None = None

    @model_validator(mode="after")
    def validate_anchor(self) -> "CreationConnectionInput":
        """保证连线只有一个方向锚点。"""
        values = [
            self.source_element_id,
            self.source_item_ref,
            self.target_element_id,
            self.target_item_ref,
        ]
        if sum(value is not None for value in values) != 1:
            raise ValueError("each initial connection must provide exactly one source or target reference")
        return self


class ElementInput(BaseToolParams):
    """新增 Element 参数。"""

    model_config = ConfigDict(extra="forbid")
    item_ref: str
    element_type: str
    name: str | None = None
    layout: LayoutInput | None = None
    content: ContentInput | None = None
    connections: list[CreationConnectionInput] = Field(default_factory=list)


class FrameSelectionInput(BaseToolParams):
    """将已有同层级 Element 框选为新 Frame 的参数。"""

    model_config = ConfigDict(extra="forbid")
    item_ref: str
    element_ids: list[str] = Field(..., min_length=1, max_length=100)
    name: str | None = None
    padding: float | None = Field(None, ge=0)


class AddContentInput(BaseToolParams):
    """追加 Content 参数。"""

    model_config = ConfigDict(extra="forbid")
    item_ref: str
    element_id: str
    content: ContentInput


class GenerationOverrideInput(BaseToolParams):
    """失败生成重试时允许覆盖的公开生成参数。"""

    model_config = ConfigDict(extra="forbid")
    prompt: str | None = Field(None, min_length=1)
    model_id: str | None = None
    name: str | None = None
    size: str | None = None
    reference_images: list[str] | None = None
    reference_image_paths: list[str] | None = None
    reference_video_paths: list[str] | None = None
    reference_audio_paths: list[str] | None = None
    frame_start_path: str | None = None
    frame_end_path: str | None = None
    duration_seconds: int | None = Field(None, gt=0)
    aspect_ratio: str | None = None
    resolution: str | None = None
    fps: int | None = Field(None, gt=0)
    seed: int | None = None
    watermark: bool | None = None
    extensions: dict[str, Any] | None = None


class RetryContentInput(BaseToolParams):
    """失败 Content 重试参数。"""

    model_config = ConfigDict(extra="forbid")
    item_ref: str
    element_id: str
    content_id: str
    generation_override: GenerationOverrideInput | None = None


class MainContentInput(BaseToolParams):
    """选择主 Content 参数。"""

    model_config = ConfigDict(extra="forbid")
    item_ref: str
    element_id: str
    content_id: str


class LayoutElementInput(BaseToolParams):
    """调整布局参数。"""

    model_config = ConfigDict(extra="forbid")
    item_ref: str
    element_id: str
    layout: LayoutInput


class ConnectionInput(BaseToolParams):
    """新增、删除或替换 Connection 参数。"""

    model_config = ConfigDict(extra="forbid")
    item_ref: str
    source_element_id: str | None = None
    target_element_id: str | None = None
    replace_existing_connections: bool = False
    remove_connection_ids: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_operation(self) -> "ConnectionInput":
        """保证每个 item 只有一个明确的连线操作分支。"""
        has_endpoints = self.source_element_id is not None or self.target_element_id is not None
        if has_endpoints and (not self.source_element_id or not self.target_element_id):
            raise ValueError("source_element_id and target_element_id must be provided together")
        if self.replace_existing_connections and (not has_endpoints or not self.remove_connection_ids):
            raise ValueError("replacement requires endpoints and remove_connection_ids")
        if self.remove_connection_ids and has_endpoints and not self.replace_existing_connections:
            raise ValueError("set replace_existing_connections=true when replacing an existing Connection")
        if not has_endpoints and not self.remove_connection_ids:
            raise ValueError("connection item must add, remove, or replace a Connection")
        return self


class WaitTask(BaseToolParams):
    """异步生成任务标识。"""

    generation_task_id: str
