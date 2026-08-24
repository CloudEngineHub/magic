"""Video Edit Content Fields 领域模型。"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
from typing import ClassVar

from app.tools.canvas.domain.content_fields.base import CanvasContentFields
from app.tools.canvas.domain.errors import CanvasDomainError
from app.tools.canvas.domain.types import JsonObject


@dataclass
class VideoEditContentFields(CanvasContentFields):
    """保存视频 Element 顺序和输出配置。"""

    MAX_VIDEO_SEQUENCE_LENGTH: ClassVar[int] = 100
    OUTPUT_FIELDS: ClassVar[frozenset[str]] = frozenset(
        {"aspectRatio", "width", "height", "resolution", "format", "audioPolicy"}
    )

    video_sequence: list[str] = field(default_factory=list)
    audio_sequence: list[str] = field(default_factory=list)
    output: JsonObject | None = None

    def __post_init__(self) -> None:
        """创建 Fields 时立即校验 Video Edit 的结构不变量。"""
        self.validate()

    def validate(self) -> None:
        """校验媒体序列和首版输出格式约束。"""
        if not self.video_sequence:
            raise CanvasDomainError(
                "VIDEO_EDIT_SEQUENCE_INVALID",
                "videoSequence must contain at least one Video Element.",
            )
        if len(self.video_sequence) > self.MAX_VIDEO_SEQUENCE_LENGTH:
            raise CanvasDomainError(
                "VIDEO_EDIT_SEQUENCE_INVALID",
                f"videoSequence supports at most {self.MAX_VIDEO_SEQUENCE_LENGTH} Video Elements.",
            )
        self._validate_unique_ids("videoSequence", self.video_sequence)
        if len(self.audio_sequence) > 1:
            raise CanvasDomainError(
                "VIDEO_EDIT_SEQUENCE_INVALID",
                "audioSequence supports at most one Audio Element.",
            )
        self._validate_unique_ids("audioSequence", self.audio_sequence)
        self._validate_output(self.output)

    @classmethod
    def _validate_output(cls, output: JsonObject | None) -> None:
        """校验输出对象的字段集合、字段类型和首版格式。"""
        if output is None:
            return
        if not isinstance(output, dict):
            raise CanvasDomainError(
                "VIDEO_EDIT_OUTPUT_INVALID",
                "Video Edit output must be an object.",
            )
        unknown_fields = set(output) - cls.OUTPUT_FIELDS
        if unknown_fields:
            raise CanvasDomainError(
                "VIDEO_EDIT_OUTPUT_INVALID",
                "Unsupported Video Edit output fields: " + ", ".join(sorted(unknown_fields)) + ".",
            )
        for field_name in ("aspectRatio", "resolution"):
            value = output.get(field_name)
            if value is not None and not isinstance(value, str):
                raise CanvasDomainError(
                    "VIDEO_EDIT_OUTPUT_INVALID",
                    f"Video Edit output {field_name} must be a string.",
                )
        width = output.get("width")
        height = output.get("height")
        if (width is None) != (height is None):
            raise CanvasDomainError(
                "VIDEO_EDIT_OUTPUT_INVALID",
                "Video Edit output width and height must be provided together.",
            )
        if width is not None and (
            isinstance(width, bool)
            or not isinstance(width, int)
            or width < 2
            or isinstance(height, bool)
            or not isinstance(height, int)
            or height < 2
        ):
            raise CanvasDomainError(
                "VIDEO_EDIT_OUTPUT_INVALID",
                "Video Edit output width and height must be positive pixel integers.",
            )
        output_format = output.get("format", "mp4")
        if output_format != "mp4":
            raise CanvasDomainError(
                "VIDEO_EDIT_OUTPUT_INVALID",
                "Only MP4 output is supported.",
            )
        audio_policy = output.get("audioPolicy", "preserve")
        if not isinstance(audio_policy, str) or audio_policy not in {"preserve", "mute"}:
            raise CanvasDomainError(
                "VIDEO_EDIT_OUTPUT_INVALID",
                "Video Edit output audioPolicy must be preserve or mute.",
            )

    @staticmethod
    def _validate_unique_ids(field_name: str, values: list[str]) -> None:
        """拒绝空白 ID 和同一序列中的重复引用。"""
        if any(not isinstance(value, str) or not value.strip() for value in values):
            raise CanvasDomainError(
                "VIDEO_EDIT_SEQUENCE_INVALID",
                f"{field_name} IDs must be non-empty strings.",
            )
        if len(values) != len(set(values)):
            raise CanvasDomainError(
                "VIDEO_EDIT_SEQUENCE_INVALID",
                f"{field_name} IDs must be unique.",
            )

    def to_dict(self) -> dict[str, object]:
        """转换为 Video Edit Content 协议字段。"""
        values: dict[str, object] = {
            "videoSequence": list(self.video_sequence),
            "audioSequence": list(self.audio_sequence),
        }
        if self.output is not None:
            values["output"] = deepcopy(self.output)
        return values
