"""布局策略变更计划。"""

from dataclasses import dataclass
from app.tools.canvas.domain.errors import CanvasDomainError
from app.tools.canvas.domain.models import CanvasDocument
from app.tools.canvas.domain.models.element_properties import ElementProperties


@dataclass(frozen=True)
class LayoutMutationPlan:
    """封装布局策略计算出的最小字段变更。"""

    element_id: str
    properties: ElementProperties

    def apply(self, canvas: CanvasDocument) -> None:
        """把布局变更应用到当前内存 Canvas 快照。"""
        element = canvas.get_element(self.element_id)
        if element is None:
            raise CanvasDomainError("ELEMENT_NOT_FOUND", f"Element {self.element_id} does not exist.")
        current = element.properties
        for field_name in ("x", "y", "width", "height", "scale_x", "scale_y", "z_index"):
            value = getattr(self.properties, field_name)
            if value is not None:
                setattr(current, field_name, value)
