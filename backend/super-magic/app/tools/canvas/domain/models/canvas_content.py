"""Canvas Content 领域模型。"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any

@dataclass
class CanvasContent:
    """表示一个 Element 下的 Content 版本。"""

    content_id: str
    fields: dict[str, Any] = field(default_factory=dict)

    def clone(self) -> "CanvasContent":
        """返回当前 Content 的深拷贝。"""
        return CanvasContent(self.content_id, deepcopy(self.fields))

    def to_dict(self) -> dict[str, Any]:
        """转换为主协议 Content 字典。"""
        return {"contentId": self.content_id, **deepcopy(self.fields)}
