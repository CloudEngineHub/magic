"""跨版本画布 Element 精确查询服务。"""

from typing import Any, Iterable, List, Sequence

from app.tools.design.codec.v3_codec import MAGIC_PROJECT_VERSION_V3
from app.tools.design.domain.canvas_document import CanvasElementV3
from app.tools.design.domain.query import (
    CanvasConnectionView,
    CanvasContentView,
    CanvasElementView,
    CanvasQueryResult,
)
from app.tools.design.manager.canvas_manager_factory import get_canvas_manager
from app.tools.design.manager.canvas_manager_v2 import CanvasManagerV2
from app.tools.design.manager.canvas_manager_v3 import CanvasManagerV3
from app.tools.design.utils.magic_project_design_parser import (
    MAGIC_PROJECT_VERSION_V1,
    MAGIC_PROJECT_VERSION_V2,
    flatten_all_elements,
)

MAX_QUERY_ELEMENT_IDS = 10

_LEGACY_CONTENT_FIELDS = (
    "src",
    "status",
    "errorMessage",
    "generateImageRequest",
    "generateVideoRequest",
    "visualUnderstanding",
    "content",
    "defaultStyle",
    "fill",
    "stroke",
    "strokeWidth",
    "cornerRadius",
    "sides",
    "innerRadiusRatio",
)

_SHELL_FIELDS = (
    "x",
    "y",
    "width",
    "height",
    "zIndex",
    "visible",
    "locked",
    "opacity",
    "scaleX",
    "scaleY",
    "rotation",
    "parentId",
)


class CanvasQueryService:
    """按确定的 Element ID 把 V1、V2、V3 映射为稳定查询结果。"""

    async def query(
        self,
        project_path: str,
        *,
        element_ids: Sequence[str],
    ) -> CanvasQueryResult:
        """实时读取画布，并按请求顺序精确返回一到十个 Element。"""
        requested_ids = list(dict.fromkeys(value.strip() for value in element_ids if value.strip()))
        if not requested_ids:
            raise ValueError("At least one exact Element ID is required")
        if len(requested_ids) > MAX_QUERY_ELEMENT_IDS:
            raise ValueError(f"At most {MAX_QUERY_ELEMENT_IDS} Element IDs can be queried at once")

        manager = await get_canvas_manager(project_path)
        config = await manager.read_current_canvas()

        if isinstance(manager, CanvasManagerV3):
            elements_by_id = {
                element.id: element
                for element in config.canvas.iter_elements()
            }
            views = [
                self._view_v3_element(elements_by_id[element_id])
                for element_id in requested_ids
                if element_id in elements_by_id
            ]
            version = MAGIC_PROJECT_VERSION_V3
            matched_ids = {view.element_id for view in views}
            connections = self._view_connections(
                connection
                for connection in config.canvas.connections
                if connection.source_element_id in matched_ids
                or connection.target_element_id in matched_ids
            )
        else:
            elements_by_id = {
                element.id: element
                for element in flatten_all_elements(config)
            }
            views = [
                self._view_legacy_element(elements_by_id[element_id])
                for element_id in requested_ids
                if element_id in elements_by_id
            ]
            version = MAGIC_PROJECT_VERSION_V2 if isinstance(manager, CanvasManagerV2) else MAGIC_PROJECT_VERSION_V1
            connections = []

        missing_element_ids = [
            element_id
            for element_id in requested_ids
            if element_id not in elements_by_id
        ]
        return CanvasQueryResult(
            version=version,
            elements=views,
            connections=connections,
            missing_element_ids=missing_element_ids,
        )

    def _view_v3_element(
        self,
        element: CanvasElementV3,
    ) -> CanvasElementView:
        """把 V3 Element 及其全部 Content 转换为查询视图。"""
        return CanvasElementView(
            element_id=element.id,
            element_type=element.type,
            name=element.name or element.id,
            active_content_id=element.active_content_id,
            main_content_id=element.main_content_id,
            contents=[
                CanvasContentView(content_id=content.content_id, fields=dict(content.fields))
                for content in element.contents
            ],
            properties=dict(element.properties),
        )

    @staticmethod
    def _view_legacy_element(element: Any) -> CanvasElementView:
        """把 V1/V2 平面 Element 转换为单 Content 查询视图。"""
        content_fields = {
            field_name: getattr(element, field_name)
            for field_name in _LEGACY_CONTENT_FIELDS
            if getattr(element, field_name, None) is not None
        }
        properties = {
            field_name: getattr(element, field_name)
            for field_name in _SHELL_FIELDS
            if getattr(element, field_name, None) is not None
        }
        return CanvasElementView(
            element_id=element.id,
            element_type=element.type,
            name=element.name or element.id,
            active_content_id=element.id,
            main_content_id=element.id,
            contents=[CanvasContentView(content_id=element.id, fields=content_fields)],
            properties=properties,
        )

    @staticmethod
    def _view_connections(connections: Iterable[Any]) -> List[CanvasConnectionView]:
        """把 V3 Connection 转换为稳定查询视图。"""
        return [
            CanvasConnectionView(
                connection_id=connection.id,
                source_element_id=connection.source_element_id,
                target_element_id=connection.target_element_id,
                locked=connection.locked,
            )
            for connection in connections
        ]
