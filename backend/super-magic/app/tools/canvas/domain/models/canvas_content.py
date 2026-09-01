"""Canvas Content 领域模型。"""

from __future__ import annotations

from dataclasses import dataclass

from app.tools.canvas.domain.content_fields import CanvasContentFields


@dataclass
class CanvasContent:
    """表示一个 Element 下的 Content 版本。"""

    content_id: str
    fields: CanvasContentFields

    def clone(self) -> "CanvasContent":
        """返回当前 Content 的深拷贝。"""
        return CanvasContent(self.content_id, self.fields.clone())

    def to_dict(self) -> dict[str, object]:
        """转换为主协议 Content 字典。"""
        return {"contentId": self.content_id, **self.fields.to_dict()}
