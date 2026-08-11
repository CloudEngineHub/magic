"""视频生产画布的增量阶段布局服务。"""

from __future__ import annotations

from typing import Dict, Iterable, List, Optional, Sequence, Set

from app.tools.design.domain.canvas_document import CanvasDocumentV3, CanvasElementV3


class VideoProductionLayoutService:
    """仅为本次新建的视频生产节点计算布局，不修改已有节点。"""

    MEDIA_TYPES = frozenset({"image", "video", "audio"})
    HORIZONTAL_GAP = 560.0
    VERTICAL_GAP = 240.0
    STORYBOARD_WIDTH = 960.0
    STORYBOARD_HEIGHT = 1360.0
    VIDEO_EDIT_WIDTH = 520.0
    VIDEO_EDIT_HEIGHT = 360.0

    @classmethod
    def layout_new_elements(
        cls,
        canvas: CanvasDocumentV3,
        new_element_ids: Iterable[str],
    ) -> None:
        """按生产阶段放置指定的新节点，并保持其他 Element 布局完全不变。"""
        if not isinstance(canvas, CanvasDocumentV3):
            return
        requested_ids = set(new_element_ids)
        if not requested_ids:
            return

        elements = [
            element
            for element in canvas.elements
            if element.type not in {"frame", "group"}
        ]
        new_ids = {element.id for element in elements if element.id in requested_ids}
        if not new_ids:
            return

        columns = cls._build_stage_columns(canvas, elements)
        cls._place_new_elements(columns, new_ids, elements)

    @classmethod
    def layout(
        cls,
        canvas: CanvasDocumentV3,
        new_element_ids: Iterable[str] = (),
    ) -> None:
        """兼容旧调用入口，但只处理调用方明确声明的新节点。"""
        cls.layout_new_elements(canvas, new_element_ids)

    @classmethod
    def _build_stage_columns(
        cls,
        canvas: CanvasDocumentV3,
        elements: List[CanvasElementV3],
    ) -> list[tuple[List[CanvasElementV3], Optional[tuple[float, float]]]]:
        """根据业务关系把节点划分为稳定的视频生产阶段。"""
        incoming, _ = cls._connection_index(canvas, elements)
        storyboards = [element for element in elements if element.type == "storyboard"]
        video_edits = [element for element in elements if element.type == "video-edit"]
        storyboard_output_ids = cls._storyboard_output_ids(canvas, storyboards)
        video_edit_ids = {element.id for element in video_edits}
        video_edit_inputs = {
            connection.source_element_id
            for connection in canvas.connections
            if connection.target_element_id in video_edit_ids
        }
        final_video_ids = {
            connection.target_element_id
            for connection in canvas.connections
            if connection.source_element_id in video_edit_ids
        }

        reference_media = [
            element
            for element in elements
            if element.type in cls.MEDIA_TYPES
            and element.id not in storyboard_output_ids
            and element.id not in video_edit_inputs
            and element.id not in final_video_ids
            and not incoming.get(element.id)
        ]
        generated_media = [
            element
            for element in elements
            if element.type in cls.MEDIA_TYPES
            and element.id not in storyboard_output_ids
            and element.id not in video_edit_inputs
            and element.id not in final_video_ids
            and bool(incoming.get(element.id))
        ]
        storyboard_outputs = cls._ordered_elements(
            elements,
            storyboard_output_ids,
            storyboards,
        )
        video_inputs = [
            element
            for element in elements
            if element.id in video_edit_inputs and element.type in cls.MEDIA_TYPES
        ]
        final_videos = [element for element in elements if element.id in final_video_ids]
        return [
            (reference_media, None),
            (generated_media, None),
            (storyboards, (cls.STORYBOARD_WIDTH, cls.STORYBOARD_HEIGHT)),
            (storyboard_outputs, None),
            (video_inputs, None),
            (video_edits, (cls.VIDEO_EDIT_WIDTH, cls.VIDEO_EDIT_HEIGHT)),
            (final_videos, None),
        ]

    @classmethod
    def _place_new_elements(
        cls,
        columns: Sequence[
            tuple[List[CanvasElementV3], Optional[tuple[float, float]]]
        ],
        new_ids: Set[str],
        all_elements: Sequence[CanvasElementV3],
    ) -> None:
        """逐阶段追加本批新节点，只写入新节点的位置、默认尺寸和图层。"""
        next_z_index = cls._next_z_index(all_elements, new_ids)
        for column_index, (items, defaults) in enumerate(columns):
            new_items = [element for element in items if element.id in new_ids]
            if not new_items:
                continue
            for element in new_items:
                if defaults is not None:
                    cls._set_default_dimensions(element, defaults)

            existing_items = [
                element
                for element in items
                if element.id not in new_ids and cls._has_position(element)
            ]
            if existing_items:
                x = cls._column_x(existing_items)
                y = max(
                    (element.y or 0.0) + cls._height(element, defaults)
                    for element in existing_items
                ) + cls.VERTICAL_GAP
            else:
                x, y = cls._empty_column_origin(
                    columns,
                    column_index,
                    new_ids,
                    new_items,
                    defaults,
                )

            for element in new_items:
                element.properties["x"] = x
                element.properties["y"] = y
                element.properties["zIndex"] = next_z_index
                next_z_index += 1
                y += cls._height(element, defaults) + cls.VERTICAL_GAP

    @classmethod
    def _empty_column_origin(
        cls,
        columns: Sequence[
            tuple[List[CanvasElementV3], Optional[tuple[float, float]]]
        ],
        column_index: int,
        new_ids: Set[str],
        new_items: Sequence[CanvasElementV3],
        defaults: Optional[tuple[float, float]],
    ) -> tuple[float, float]:
        """为尚无已有节点的阶段选择相邻阶段外侧的追加位置。"""
        previous_items = cls._nearest_positioned_column(
            columns,
            column_index,
            step=-1,
        )
        if previous_items:
            return (
                max(
                    (element.x or 0.0) + cls._width(element, None)
                    for element in previous_items
                )
                + cls.HORIZONTAL_GAP,
                min(element.y or 0.0 for element in previous_items),
            )

        next_items = cls._nearest_positioned_column(
            columns,
            column_index,
            step=1,
            excluded_ids=new_ids,
        )
        if next_items:
            column_width = max(cls._width(element, defaults) for element in new_items)
            return (
                min(element.x or 0.0 for element in next_items)
                - cls.HORIZONTAL_GAP
                - column_width,
                min(element.y or 0.0 for element in next_items),
            )
        return 0.0, 0.0

    @classmethod
    def _nearest_positioned_column(
        cls,
        columns: Sequence[
            tuple[List[CanvasElementV3], Optional[tuple[float, float]]]
        ],
        start_index: int,
        *,
        step: int,
        excluded_ids: Optional[Set[str]] = None,
    ) -> List[CanvasElementV3]:
        """沿指定方向查找最近一个已经具有坐标的阶段。"""
        excluded = excluded_ids or set()
        index = start_index + step
        while 0 <= index < len(columns):
            positioned = [
                element
                for element in columns[index][0]
                if element.id not in excluded and cls._has_position(element)
            ]
            if positioned:
                return positioned
            index += step
        return []

    @staticmethod
    def _has_position(element: CanvasElementV3) -> bool:
        """判断节点是否已有可用于增量布局的坐标。"""
        return element.x is not None and element.y is not None

    @classmethod
    def _column_x(cls, elements: Sequence[CanvasElementV3]) -> float:
        """使用阶段中最先出现节点的 X 坐标作为追加列坐标。"""
        return elements[0].x or 0.0

    @classmethod
    def _next_z_index(
        cls,
        elements: Sequence[CanvasElementV3],
        new_ids: Set[str],
    ) -> int:
        """基于已有节点计算本批新增节点的首个图层值。"""
        existing_z_indices = [
            element.zIndex
            for element in elements
            if element.id not in new_ids and element.zIndex is not None
        ]
        return max(existing_z_indices, default=0) + 1

    @classmethod
    def _ordered_elements(
        cls,
        elements: List[CanvasElementV3],
        element_ids: Set[str],
        storyboards: List[CanvasElementV3],
    ) -> List[CanvasElementV3]:
        """按 Storyboard shot 顺序返回分镜输出图，其他图按文档顺序补充。"""
        ordered_ids: List[str] = []
        for storyboard in storyboards:
            content = storyboard.get_active_content() or storyboard.get_main_content()
            shots = content.fields.get("shots", []) if content is not None else []
            if not isinstance(shots, list):
                continue
            for shot in shots:
                if not isinstance(shot, dict):
                    continue
                element_id = shot.get("outputImageElementId")
                if (
                    isinstance(element_id, str)
                    and element_id in element_ids
                    and element_id not in ordered_ids
                ):
                    ordered_ids.append(element_id)
        ordered_ids.extend(
            element.id
            for element in elements
            if element.id in element_ids and element.id not in ordered_ids
        )
        by_id = {element.id: element for element in elements}
        return [by_id[element_id] for element_id in ordered_ids if element_id in by_id]

    @classmethod
    def _storyboard_output_ids(
        cls,
        canvas: CanvasDocumentV3,
        storyboards: Iterable[CanvasElementV3],
    ) -> Set[str]:
        """综合镜头字段与锁定关系识别分镜输出图片。"""
        storyboard_list = list(storyboards)
        result: Set[str] = set()
        for storyboard in storyboard_list:
            content = storyboard.get_active_content() or storyboard.get_main_content()
            shots = content.fields.get("shots", []) if content is not None else []
            if not isinstance(shots, list):
                continue
            for shot in shots:
                if isinstance(shot, dict) and isinstance(
                    shot.get("outputImageElementId"),
                    str,
                ):
                    result.add(shot["outputImageElementId"])
        storyboard_ids = {storyboard.id for storyboard in storyboard_list}
        for connection in canvas.connections:
            if not connection.locked or connection.source_element_id not in storyboard_ids:
                continue
            target = canvas.get_element(connection.target_element_id)
            if target is not None and target.type == "image":
                result.add(target.id)
        return result

    @classmethod
    def _connection_index(
        cls,
        canvas: CanvasDocumentV3,
        elements: Iterable[CanvasElementV3],
    ) -> tuple[Dict[str, Set[str]], Dict[str, Set[str]]]:
        """建立连接的入边、出边索引，供阶段识别使用。"""
        ids = {element.id for element in elements}
        incoming: Dict[str, Set[str]] = {element_id: set() for element_id in ids}
        outgoing: Dict[str, Set[str]] = {element_id: set() for element_id in ids}
        for connection in canvas.connections:
            if (
                connection.source_element_id in ids
                and connection.target_element_id in ids
            ):
                outgoing[connection.source_element_id].add(
                    connection.target_element_id
                )
                incoming[connection.target_element_id].add(
                    connection.source_element_id
                )
        return incoming, outgoing

    @staticmethod
    def _set_default_dimensions(
        element: CanvasElementV3,
        defaults: tuple[float, float],
    ) -> None:
        """仅在新节点缺失尺寸时写入视频节点默认尺寸。"""
        width, height = defaults
        if element.width is None or element.width <= 0:
            element.properties["width"] = width
        if element.height is None or element.height <= 0:
            element.properties["height"] = height

    @classmethod
    def _width(
        cls,
        element: CanvasElementV3,
        defaults: Optional[tuple[float, float]],
    ) -> float:
        """读取节点宽度，缺失时使用阶段或媒体占位宽度。"""
        fallback = defaults[0] if defaults else 1024.0
        return cls._dimension(element.width, fallback)

    @classmethod
    def _height(
        cls,
        element: CanvasElementV3,
        defaults: Optional[tuple[float, float]],
    ) -> float:
        """读取节点高度，缺失时使用阶段或媒体占位高度。"""
        fallback = defaults[1] if defaults else 1024.0
        return cls._dimension(element.height, fallback)

    @staticmethod
    def _dimension(value: float | None, fallback: float) -> float:
        """读取正数尺寸，否则返回布局占位尺寸。"""
        return value if value is not None and value > 0 else fallback
