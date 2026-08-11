"""Canvas V3 Element 内部布局领域服务。"""

from math import floor
from typing import Iterable, Optional, Set

from app.tools.design.constants import (
    DEFAULT_ELEMENT_HEIGHT,
    DEFAULT_ELEMENT_SPACING,
    DEFAULT_ELEMENT_WIDTH,
)
from app.tools.design.domain.canvas_document import CanvasDocumentV3, CanvasElementV3


class ElementLayoutService:
    """为后端新建的 V3 Element 补齐可持久化的初始布局。"""

    DEFAULT_MAX_ELEMENTS_PER_ROW = 4
    MAX_ELEMENTS_PER_ROW_BY_TYPE = {"image": 6, "video": 4}

    @classmethod
    def layout_element(
        cls,
        canvas: CanvasDocumentV3,
        element: CanvasElementV3,
    ) -> CanvasElementV3:
        """补齐单个新节点缺失的 x、y、zIndex，并保留已有合法布局。"""
        existing_elements = [item for item in canvas.elements if item.id != element.id]
        cls._layout_against(element, existing_elements)
        return element

    @classmethod
    def layout_new_elements(
        cls,
        canvas: CanvasDocumentV3,
        existing_element_ids: Set[str],
    ) -> None:
        """按文档顺序补齐一次写事务中新建节点的布局。"""
        placed_elements = [
            element
            for element in canvas.elements
            if element.id in existing_element_ids
        ]
        for element in canvas.elements:
            if element.id in existing_element_ids:
                continue
            cls._layout_against(element, placed_elements)
            placed_elements.append(element)

    @classmethod
    def _layout_against(
        cls,
        element: CanvasElementV3,
        existing_elements: Iterable[CanvasElementV3],
    ) -> None:
        """基于已有节点为一个新节点计算缺失的布局字段。"""
        existing_element_list = list(existing_elements)
        positioned_elements = [
            item
            for item in existing_element_list
            if item.visible is not False and item.x is not None and item.y is not None
        ]
        if element.x is None or element.y is None:
            x, y = cls._calculate_position(positioned_elements, element.type)
            if element.x is None:
                element.properties["x"] = x
            if element.y is None:
                element.properties["y"] = y
        if cls._number(element.properties.get("zIndex")) is None:
            max_z_index = max(
                (
                    value
                    for item in existing_element_list
                    if (value := cls._number(item.properties.get("zIndex"))) is not None
                ),
                default=0.0,
            )
            element.properties["zIndex"] = floor(max_z_index) + 1

    @classmethod
    def _calculate_position(
        cls,
        positioned_elements: list[CanvasElementV3],
        element_type: str,
    ) -> tuple[float, float]:
        """沿用生成工具的行式布局，为新节点寻找下一处初始位置。"""
        if not positioned_elements:
            return 0.0, 0.0

        max_y = max(item.y or 0.0 for item in positioned_elements)
        last_row = [
            item
            for item in positioned_elements
            if item.y is not None and abs(item.y - max_y) < 1.0
        ]
        max_elements_per_row = cls.MAX_ELEMENTS_PER_ROW_BY_TYPE.get(
            element_type,
            cls.DEFAULT_MAX_ELEMENTS_PER_ROW,
        )
        if last_row and len(last_row) < max_elements_per_row:
            rightmost = max(last_row, key=lambda item: item.x or 0.0)
            return (
                (rightmost.x or 0.0) + cls._width(rightmost) + DEFAULT_ELEMENT_SPACING,
                max_y,
            )

        min_x = min(item.x or 0.0 for item in positioned_elements)
        max_bottom = max(
            (item.y or 0.0) + cls._height(item)
            for item in positioned_elements
        )
        return min_x, max_bottom + DEFAULT_ELEMENT_SPACING

    @staticmethod
    def _width(element: CanvasElementV3) -> float:
        """读取节点宽度，缺失或非法时使用内部布局占位宽度。"""
        width = element.width
        return width if width is not None and width > 0 else DEFAULT_ELEMENT_WIDTH

    @staticmethod
    def _height(element: CanvasElementV3) -> float:
        """读取节点高度，缺失或非法时使用内部布局占位高度。"""
        height = element.height
        return height if height is not None and height > 0 else DEFAULT_ELEMENT_HEIGHT

    @staticmethod
    def _number(value: object) -> Optional[float]:
        """读取排除布尔值的数值属性。"""
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return float(value)
        return None
