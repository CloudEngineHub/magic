"""V3 Element Content 领域模型。"""

from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any, Dict


@dataclass
class ElementContent:
    """表示 Element 内一个可独立切换的 Content。"""

    content_id: str
    fields: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ElementContent":
        """从 V3 DSL 字典创建 Content。"""
        content_id = data.get("contentId")
        if not isinstance(content_id, str) or not content_id:
            raise ValueError("Content contentId must be a non-empty string")
        if "id" in data or "type" in data:
            raise ValueError(f"Content {content_id} must not contain id or type")
        return cls(
            content_id=content_id,
            fields=deepcopy({key: value for key, value in data.items() if key != "contentId"}),
        )

    def to_dict(self) -> Dict[str, Any]:
        """转换为不带内部包装字段的 V3 DSL 字典。"""
        return {"contentId": self.content_id, **deepcopy(self.fields)}

    def clone(self) -> "ElementContent":
        """返回当前 Content 的深拷贝。"""
        return ElementContent(content_id=self.content_id, fields=deepcopy(self.fields))

