"""Video Edit Content Fields 领域模型。"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field

from app.tools.canvas.domain.content_fields.base import CanvasContentFields
from app.tools.canvas.domain.types import JsonObject


@dataclass
class VideoEditContentFields(CanvasContentFields):
    """保存视频 Element 顺序和输出配置。"""

    video_sequence: list[str] = field(default_factory=list)
    output: JsonObject | None = None

    def to_dict(self) -> dict[str, object]:
        """转换为 Video Edit Content 协议字段。"""
        values: dict[str, object] = {"videoSequence": list(self.video_sequence)}
        if self.output is not None:
            values["output"] = deepcopy(self.output)
        return values
