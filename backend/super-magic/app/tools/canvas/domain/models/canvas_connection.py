"""Canvas Connection 领域模型。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

@dataclass
class CanvasConnection:
    """表示两个 Element 之间的关系。"""

    connection_id: str
    source_element_id: str
    target_element_id: str

    def to_dict(self) -> dict[str, Any]:
        """转换为主协议 Connection 字典。"""
        return {
            "id": self.connection_id,
            "sourceElementId": self.source_element_id,
            "targetElementId": self.target_element_id,
        }
