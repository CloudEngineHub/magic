"""跨版本画布 Element 精确查询和概览服务。"""

import math
from typing import Any, Iterable, List, Optional, Sequence

from app.tools.design.codec.v3_codec import MAGIC_PROJECT_VERSION_V3
from app.tools.design.domain.canvas_document import CanvasElementV3
from app.tools.design.domain.query import (
    CanvasConnectionView,
    CanvasContentView,
    CanvasElementView,
    CanvasElementOverviewView,
    CanvasOverviewResult,
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
DEFAULT_OVERVIEW_LIMIT = 50
MAX_OVERVIEW_LIMIT = 100

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
            validation_warnings=list(config.validation_warnings) if isinstance(manager, CanvasManagerV3) else [],
        )

    async def overview(
        self,
        project_path: str,
        *,
        page: int = 1,
        limit: int = DEFAULT_OVERVIEW_LIMIT,
    ) -> CanvasOverviewResult:
        """按页返回轻量画布索引。"""
        if page < 1:
            raise ValueError("Overview page must be greater than or equal to 1")
        if limit < 1 or limit > MAX_OVERVIEW_LIMIT:
            raise ValueError(f"Overview limit must be between 1 and {MAX_OVERVIEW_LIMIT}")

        manager = await get_canvas_manager(project_path)
        config = await manager.read_current_canvas()
        if isinstance(manager, CanvasManagerV3):
            raw_elements = list(config.canvas.iter_elements())
            total_connections = len(config.canvas.connections)
            connection_pairs = [
                (connection.source_element_id, connection.target_element_id)
                for connection in config.canvas.connections
            ]
        else:
            raw_elements = list(flatten_all_elements(config))
            total_connections = 0
            connection_pairs = []

        incoming_by_element: dict[str, list[str]] = {}
        outgoing_by_element: dict[str, list[str]] = {}
        for source_element_id, target_element_id in connection_pairs:
            outgoing_by_element.setdefault(source_element_id, []).append(target_element_id)
            incoming_by_element.setdefault(target_element_id, []).append(source_element_id)

        overview_elements = [
            self._view_overview_element(
                element,
                incoming_element_ids=incoming_by_element.get(element.id, []),
                outgoing_element_ids=outgoing_by_element.get(element.id, []),
            )
            for element in raw_elements
        ]
        total_pages = math.ceil(len(overview_elements) / limit) if overview_elements else 1
        offset = (page - 1) * limit
        page_elements = overview_elements[offset : offset + limit]
        has_more = page < total_pages
        elements_by_type: dict[str, int] = {}
        for element in overview_elements:
            elements_by_type[element.element_type] = elements_by_type.get(element.element_type, 0) + 1

        return CanvasOverviewResult(
            project_name=config.name or "Untitled",
            project_type=config.type,
            total_elements=len(overview_elements),
            total_connections=total_connections,
            elements_by_type=dict(sorted(elements_by_type.items())),
            elements=page_elements,
            returned=len(page_elements),
            page=page,
            limit=limit,
            total_pages=total_pages,
            has_more=has_more,
            validation_warnings=list(config.validation_warnings) if isinstance(manager, CanvasManagerV3) else [],
        )

    @staticmethod
    def _view_overview_element(
        element: Any,
        *,
        incoming_element_ids: Optional[Sequence[str]] = None,
        outgoing_element_ids: Optional[Sequence[str]] = None,
    ) -> CanvasElementOverviewView:
        """把 Element 转为不包含重字段和布局字段的轻量索引。"""
        incoming_ids = list(incoming_element_ids or [])
        outgoing_ids = list(outgoing_element_ids or [])
        contents = getattr(element, "contents", None)
        if contents is not None:
            status = getattr(element, "status", None)
            return CanvasElementOverviewView(
                element_id=element.id,
                element_type=element.type,
                name=getattr(element, "name", None) or element.id,
                status=status,
                content_count=len(contents),
                active_content_id=getattr(element, "active_content_id", None),
                main_content_id=getattr(element, "main_content_id", None),
                incoming_element_ids=incoming_ids,
                outgoing_element_ids=outgoing_ids,
            )

        return CanvasElementOverviewView(
            element_id=element.id,
            element_type=element.type,
            name=getattr(element, "name", None) or element.id,
            status=getattr(element, "status", None),
            content_count=1,
            active_content_id=element.id,
            main_content_id=element.id,
            incoming_element_ids=incoming_ids,
            outgoing_element_ids=outgoing_ids,
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
