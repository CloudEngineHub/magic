"""视频制作画布的从左到右增量布局服务。"""

from __future__ import annotations

from typing import Mapping, Sequence

from app.tools.design.constants import DEFAULT_ELEMENT_HEIGHT, DEFAULT_ELEMENT_WIDTH
from app.tools.design.domain.canvas_document import CanvasDocumentV3, CanvasElementV3


class VideoProductionFlowLayoutService:
    """只为调用方明确传入的新节点计算位置，不修改已有节点。"""

    HORIZONTAL_GAP = 560.0
    VERTICAL_GAP = 240.0
    ROOT_X = 0.0

    @classmethod
    def layout_roots(
        cls,
        canvas: CanvasDocumentV3,
        new_element_ids: Sequence[str],
    ) -> None:
        """把本批无上游的新节点纵向追加到根节点列。"""
        targets = cls._resolve_targets(canvas, new_element_ids)
        if not targets:
            return
        target_ids = {target.id for target in targets}
        occupied = [
            element
            for element in canvas.iter_elements()
            if element.id not in target_ids and cls._has_position(element)
        ]
        next_z_index = cls._next_z_index(canvas, target_ids)
        preferred_y = cls._root_start_y(occupied)
        for target in targets:
            x, y = cls._find_available_position(
                target,
                cls.ROOT_X,
                preferred_y,
                occupied,
            )
            cls._place(target, x, y, next_z_index)
            next_z_index += 1
            preferred_y = y + cls._height(target) + cls.VERTICAL_GAP
            occupied.append(target)

    @classmethod
    def layout_targets(
        cls,
        canvas: CanvasDocumentV3,
        source_element_ids_by_target: Mapping[str, Sequence[str]],
        new_element_ids: Sequence[str],
    ) -> None:
        """依据显式直接上游，把本批新节点从左到右放置。"""
        targets = cls._resolve_targets(canvas, new_element_ids)
        if not targets:
            return
        target_ids = {target.id for target in targets}
        occupied = [
            element
            for element in canvas.iter_elements()
            if element.id not in target_ids and cls._has_position(element)
        ]
        next_z_index = cls._next_z_index(canvas, target_ids)
        previous_y_by_sources: dict[tuple[str, ...], float] = {}

        for target in targets:
            source_ids = tuple(dict.fromkeys(source_element_ids_by_target.get(target.id, ())))
            if not source_ids:
                preferred_x = cls.ROOT_X
                preferred_y = cls._root_start_y(occupied)
            else:
                sources = cls._resolve_sources(canvas, target.id, source_ids)
                preferred_x = max(
                    (source.x or 0.0) + cls._width(source)
                    for source in sources
                ) + cls.HORIZONTAL_GAP
                preferred_y = previous_y_by_sources.get(
                    source_ids,
                    sources[0].y or 0.0,
                )

            x, y = cls._find_available_position(
                target,
                preferred_x,
                preferred_y,
                occupied,
            )
            cls._place(target, x, y, next_z_index)
            next_z_index += 1
            occupied.append(target)
            if source_ids:
                previous_y_by_sources[source_ids] = (
                    y + cls._height(target) + cls.VERTICAL_GAP
                )

    @classmethod
    def _resolve_targets(
        cls,
        canvas: CanvasDocumentV3,
        element_ids: Sequence[str],
    ) -> list[CanvasElementV3]:
        """按调用顺序解析本次允许移动的目标节点。"""
        targets: list[CanvasElementV3] = []
        for element_id in dict.fromkeys(element_ids):
            element = canvas.get_element(element_id)
            if element is None:
                raise ValueError(f"Layout target does not exist: {element_id}")
            targets.append(element)
        return targets

    @classmethod
    def _resolve_sources(
        cls,
        canvas: CanvasDocumentV3,
        target_element_id: str,
        source_element_ids: Sequence[str],
    ) -> list[CanvasElementV3]:
        """解析目标的显式上游，并要求上游已经具有稳定坐标。"""
        sources: list[CanvasElementV3] = []
        for source_id in source_element_ids:
            if source_id == target_element_id:
                raise ValueError("Layout source and target must be different Elements")
            source = canvas.get_element(source_id)
            if source is None:
                raise ValueError(f"Layout source does not exist: {source_id}")
            if not cls._has_position(source):
                raise ValueError(f"Layout source has no stable position: {source_id}")
            sources.append(source)
        return sources

    @classmethod
    def _find_available_position(
        cls,
        target: CanvasElementV3,
        preferred_x: float,
        preferred_y: float,
        occupied: Sequence[CanvasElementV3],
    ) -> tuple[float, float]:
        """从首选位置开始只向右或向下寻找无碰撞位置。"""
        candidate_x = preferred_x
        candidate_y = preferred_y
        while True:
            collisions = [
                element
                for element in occupied
                if cls._overlaps(target, candidate_x, candidate_y, element)
            ]
            if not collisions:
                return candidate_x, candidate_y
            candidate_y = max(
                (element.y or 0.0) + cls._height(element)
                for element in collisions
            ) + cls.VERTICAL_GAP

    @classmethod
    def _overlaps(
        cls,
        target: CanvasElementV3,
        target_x: float,
        target_y: float,
        occupied: CanvasElementV3,
    ) -> bool:
        """判断目标候选矩形是否与一个已布局节点相交。"""
        occupied_x = occupied.x or 0.0
        occupied_y = occupied.y or 0.0
        return not (
            target_x + cls._width(target) <= occupied_x
            or target_x >= occupied_x + cls._width(occupied)
            or target_y + cls._height(target) <= occupied_y
            or target_y >= occupied_y + cls._height(occupied)
        )

    @classmethod
    def _root_start_y(cls, occupied: Sequence[CanvasElementV3]) -> float:
        """计算根节点列下一处只向下追加的纵坐标。"""
        root_column = [
            element
            for element in occupied
            if element.x is not None and abs(element.x - cls.ROOT_X) < 1.0
        ]
        if not root_column:
            return 0.0
        return max(
            (element.y or 0.0) + cls._height(element)
            for element in root_column
        ) + cls.VERTICAL_GAP

    @staticmethod
    def _place(
        element: CanvasElementV3,
        x: float,
        y: float,
        z_index: int,
    ) -> None:
        """持久化一个新节点的坐标和图层。"""
        element.properties["x"] = x
        element.properties["y"] = y
        element.properties["zIndex"] = z_index

    @staticmethod
    def _has_position(element: CanvasElementV3) -> bool:
        """判断节点是否具有可参与碰撞计算的坐标。"""
        return element.x is not None and element.y is not None

    @staticmethod
    def _width(element: CanvasElementV3) -> float:
        """读取节点宽度，缺失时使用统一占位宽度。"""
        return element.width if element.width is not None and element.width > 0 else DEFAULT_ELEMENT_WIDTH

    @staticmethod
    def _height(element: CanvasElementV3) -> float:
        """读取节点高度，缺失时使用统一占位高度。"""
        return element.height if element.height is not None and element.height > 0 else DEFAULT_ELEMENT_HEIGHT

    @staticmethod
    def _next_z_index(canvas: CanvasDocumentV3, new_ids: set[str]) -> int:
        """基于已有节点计算本批新增节点的第一个图层值。"""
        return max(
            (
                element.zIndex
                for element in canvas.iter_elements()
                if element.id not in new_ids and element.zIndex is not None
            ),
            default=0,
        ) + 1
