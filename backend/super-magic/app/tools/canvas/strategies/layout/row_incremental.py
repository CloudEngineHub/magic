"""行式增量布局策略。"""

from app.tools.canvas.domain.models import CanvasDocument, CanvasElement
from app.tools.canvas.strategies.layout.geometry import DEFAULT_ELEMENT_SPACING, height, next_z_index, number, width
from app.tools.canvas.strategies.layout.interface import LayoutStrategyInterface
from app.tools.canvas.strategies.layout.plan import LayoutMutationPlan
from app.tools.canvas.strategies.layout.request import LayoutStrategyRequest


class RowIncrementalLayoutStrategy(LayoutStrategyInterface):
    """复刻 Design 默认的行式增量布局。"""

    name = "row_incremental"
    max_per_row = {"image": 6, "video": 4}

    def plan(
        self,
        canvas: CanvasDocument,
        element: CanvasElement,
        request: LayoutStrategyRequest,
    ) -> LayoutMutationPlan:
        """为新节点寻找下一处稳定位置。"""
        changes = {}
        positioned = [
            item
            for item in canvas.siblings(element.element_id)
            if item.element_id != element.element_id
            and item.properties.get("visible") is not False
            and number(item.properties.get("x")) is not None
            and number(item.properties.get("y")) is not None
        ]
        if "x" not in element.properties or "y" not in element.properties:
            x, y = self._next_position(positioned, element.element_type)
            changes.update({"x": element.properties.get("x", x), "y": element.properties.get("y", y)})
        if number(element.properties.get("zIndex")) is None:
            changes["zIndex"] = next_z_index(canvas, element)
        return LayoutMutationPlan(element.element_id, changes)

    def _next_position(self, positioned: list[CanvasElement], element_type: str) -> tuple[float, float]:
        """按当前最后一行容量计算下一个位置。"""
        if not positioned:
            return 0.0, 0.0
        max_y = max(float(item.properties["y"]) for item in positioned)
        last_row = [item for item in positioned if abs(float(item.properties["y"]) - max_y) < 1.0]
        maximum = self.max_per_row.get(element_type, 4)
        if last_row and len(last_row) < maximum:
            rightmost = max(last_row, key=lambda item: float(item.properties["x"]))
            return float(rightmost.properties["x"]) + width(rightmost) + DEFAULT_ELEMENT_SPACING, max_y
        min_x = min(float(item.properties["x"]) for item in positioned)
        max_bottom = max(float(item.properties["y"]) + height(item) for item in positioned)
        return min_x, max_bottom + DEFAULT_ELEMENT_SPACING
