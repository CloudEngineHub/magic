"""Canvas 层级索引与 Frame 框选策略。"""

from __future__ import annotations

from dataclasses import dataclass
import math
from typing import Any

from app.tools.canvas.domain.errors import CanvasDomainError
from app.tools.canvas.domain.models import CanvasDocument, CanvasElement, CanvasContent


@dataclass(frozen=True)
class FrameSelectionRequest:
    """表示一次将同层级 Element 框选为 Frame 的请求。"""

    item_ref: str
    element_ids: tuple[str, ...]
    name: str | None = None
    padding: float | None = None


@dataclass(frozen=True)
class FrameSelectionPlan:
    """表示已经完成校验和坐标换算的 Frame 变更计划。"""

    item_ref: str
    frame: CanvasElement
    children: tuple[CanvasElement, ...]
    selected_ids: tuple[str, ...]
    root_insert_index: int
    padding: float


class CoordinateSpaceResolver:
    """负责 Canvas 直接父级坐标空间之间的边界计算和坐标转换。"""

    @staticmethod
    def bounds(elements: list[CanvasElement]) -> tuple[float, float, float, float]:
        """计算同一坐标空间内多个 Element 的包围盒。"""
        if not elements:
            raise CanvasDomainError("FRAME_SELECTION_INVALID", "Frame selection cannot be empty.")
        bounds = [CoordinateSpaceResolver.element_bounds(element) for element in elements]
        return (
            min(item[0] for item in bounds),
            min(item[1] for item in bounds),
            max(item[2] for item in bounds),
            max(item[3] for item in bounds),
        )

    @staticmethod
    def element_bounds(element: CanvasElement) -> tuple[float, float, float, float]:
        """读取单个 Element 在其直接父级坐标空间内的包围盒。"""
        x = _number(element.properties.get("x"))
        y = _number(element.properties.get("y"))
        if x is None or y is None:
            raise CanvasDomainError("FRAME_SELECTION_INVALID", "Selected Elements must have numeric positions.")
        width = _size(element.properties.get("width"), 1024.0)
        height = _size(element.properties.get("height"), 1024.0)
        return x, y, x + width, y + height

    @staticmethod
    def to_local(element: CanvasElement, origin_x: float, origin_y: float) -> CanvasElement:
        """复制 Element 并将其位置转换为指定父级的局部坐标。"""
        child = element.clone()
        child.properties["x"] = float(element.properties.get("x", 0)) - origin_x
        child.properties["y"] = float(element.properties.get("y", 0)) - origin_y
        return child


@dataclass(frozen=True)
class HierarchyMutationPlan:
    """封装一次把同层级节点收纳到 Frame 的树结构变更。"""

    frame: CanvasElement
    selected_ids: tuple[str, ...]
    root_insert_index: int

    def apply(self, canvas: CanvasDocument) -> None:
        """在已完成校验的 Canvas 快照上原子应用层级变更。"""
        selected = set(self.selected_ids)
        canvas.elements[:] = [element for element in canvas.elements if element.element_id not in selected]
        canvas.insert_element(self.frame, index=min(self.root_insert_index, len(canvas.elements)))


class ElementTreeIndex:
    """为查询、布局和层级写入提供统一的只读树索引。"""

    def __init__(self, canvas: CanvasDocument):
        """根据当前 Canvas 快照建立索引。"""
        self._canvas = canvas
        self._parent_ids = canvas.parent_map()
        self._depths = canvas.depth_map()

    def parent_id(self, element_id: str) -> str | None:
        """返回 Element 的直接父级 ID。"""
        return self._parent_ids.get(element_id)

    def depth(self, element_id: str) -> int:
        """返回 Element 在树中的深度。"""
        return self._depths.get(element_id, 0)

    def child_ids(self, element_id: str) -> list[str]:
        """返回 Element 的直接子节点 ID。"""
        return [child.element_id for child in self._canvas.direct_children(element_id)]

    def siblings(self, element_id: str) -> list[CanvasElement]:
        """返回 Element 所在直接父级下的全部兄弟节点。"""
        parent_id = self.parent_id(element_id)
        if parent_id is None:
            return list(self._canvas.elements)
        return self._canvas.direct_children(parent_id)


class FrameSelectionStrategy:
    """把根级普通兄弟节点转换为一个 Frame 的层级策略。"""

    default_padding_divisor = 18.0

    def plan(self, canvas: CanvasDocument, request: FrameSelectionRequest) -> FrameSelectionPlan:
        """校验选区并计算 Frame 包围盒和子节点局部坐标。"""
        element_ids = list(request.element_ids)
        if not element_ids:
            raise CanvasDomainError("FRAME_SELECTION_INVALID", "Frame selection cannot be empty.")
        if len(element_ids) != len(set(element_ids)):
            raise CanvasDomainError("FRAME_SELECTION_INVALID", "Frame selection cannot contain duplicate Element IDs.")
        index = ElementTreeIndex(canvas)
        selected: list[CanvasElement] = []
        for element_id in element_ids:
            element = canvas.get_element(element_id)
            if element is None:
                raise CanvasDomainError("ELEMENT_NOT_FOUND", f"Element {element_id} does not exist.")
            if element.element_type in {"frame", "group"}:
                raise CanvasDomainError("FRAME_SELECTION_INVALID", "Frame selection cannot include Frame or Group Elements.")
            if element.properties.get("locked") is True:
                raise CanvasDomainError("FRAME_SELECTION_INVALID", f"Element {element_id} is locked.")
            if index.parent_id(element_id) is not None:
                raise CanvasDomainError("FRAME_SELECTION_ALREADY_NESTED", "Selected Elements must be direct root-level Elements.")
            selected.append(element)

        if any(index.parent_id(element.element_id) != index.parent_id(selected[0].element_id) for element in selected):
            raise CanvasDomainError("FRAME_SELECTION_MIXED_PARENTS", "Selected Elements must share the same direct parent.")

        ordered = sorted(selected, key=lambda element: canvas.elements.index(element))
        left, top, right, bottom = CoordinateSpaceResolver.bounds(ordered)
        longest = max(right - left, bottom - top)
        padding = self.default_padding_divisor and longest / self.default_padding_divisor if request.padding is None else request.padding
        if (
            not isinstance(padding, (int, float))
            or isinstance(padding, bool)
            or not math.isfinite(float(padding))
            or padding < 0
        ):
            raise CanvasDomainError("FRAME_PADDING_INVALID", "Frame padding must be a non-negative number.")

        frame_id = _new_id("frame")
        frame_x = left - float(padding)
        frame_y = top - float(padding)
        frame = CanvasElement(
            element_id=frame_id,
            element_type="frame",
            properties={
                "x": frame_x,
                "y": frame_y,
                "width": right - left + 2 * float(padding),
                "height": bottom - top + 2 * float(padding),
                "zIndex": _next_z_index(canvas),
            },
            contents=[],
            active_content_id=None,
            main_content_id=None,
            children=[],
        )
        if request.name:
            frame.properties["name"] = request.name
        content = CanvasContent(_new_id("content"), {})
        frame.contents = [content]
        frame.active_content_id = content.content_id
        frame.main_content_id = content.content_id

        child_copies = [
            CoordinateSpaceResolver.to_local(element, frame_x, frame_y)
            for element in ordered
        ]

        root_indexes = [canvas.elements.index(element) for element in ordered]
        return FrameSelectionPlan(
            item_ref=request.item_ref,
            frame=frame,
            children=tuple(child_copies),
            selected_ids=tuple(element.element_id for element in ordered),
            root_insert_index=min(root_indexes),
            padding=float(padding),
        )


def _new_id(prefix: str) -> str:
    """生成不使用模型输入的对象 ID。"""
    import uuid

    return f"{prefix}-{uuid.uuid4().hex[:16]}"


def _number(value: Any) -> float | None:
    """读取排除布尔值的数值。"""
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return None
    number = float(value)
    return number if math.isfinite(number) else None


def _size(value: Any, default: float) -> float:
    """读取正尺寸，缺失时使用 Canvas 默认占位尺寸。"""
    number = _number(value)
    return number if number is not None and number > 0 else default


def _next_z_index(canvas: CanvasDocument) -> int:
    """返回当前根级最大 zIndex 之后的值。"""
    values = [
        _number(element.properties.get("zIndex"))
        for element in canvas.iter_elements()
    ]
    return int(max((value for value in values if value is not None), default=0)) + 1
