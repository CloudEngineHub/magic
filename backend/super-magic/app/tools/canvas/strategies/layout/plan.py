"""布局策略变更计划。"""

from dataclasses import dataclass
from typing import Any

from app.tools.canvas.domain.errors import CanvasDomainError
from app.tools.canvas.domain.models import CanvasDocument


@dataclass(frozen=True)
class LayoutMutationPlan:
    """封装布局策略计算出的最小字段变更。"""

    element_id: str
    properties: dict[str, Any]

    def apply(self, canvas: CanvasDocument) -> None:
        """把布局变更应用到当前内存 Canvas 快照。"""
        element = canvas.get_element(self.element_id)
        if element is None:
            raise CanvasDomainError("ELEMENT_NOT_FOUND", f"Element {self.element_id} does not exist.")
        element.properties.update(self.properties)
