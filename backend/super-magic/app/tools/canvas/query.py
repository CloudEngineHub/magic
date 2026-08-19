"""Canvas 概览与详情查询服务。"""

from __future__ import annotations

from typing import Any

from app.tools.canvas.domain.errors import CanvasDomainError
from app.tools.canvas.domain.models import CanvasContent, CanvasElement
from app.tools.canvas.hierarchy import ElementTreeIndex
from app.tools.canvas.repository import CanvasRepository
from app.tools.canvas.sidecar import ElementDetailsAdapter


class CanvasQueryService:
    """只负责把 Canvas 持久化对象投影为稳定查询 DTO。"""

    def __init__(self, repository: CanvasRepository, sidecar_adapter: ElementDetailsAdapter | None = None):
        """保存查询所需仓储和 sidecar 适配器。"""
        self.repository = repository
        self.sidecar_adapter = sidecar_adapter or ElementDetailsAdapter()

    async def overview(self, project_path: str, page: int, limit: int) -> dict[str, Any]:
        """返回分页的轻量 Element 概览。"""
        project = await self.repository.read(project_path)
        elements = project.canvas.iter_elements()
        tree = ElementTreeIndex(project.canvas)
        total = len(elements)
        start = (page - 1) * limit
        page_items = elements[start : start + limit]
        connection_map: dict[str, dict[str, list[str]]] = {
            element.element_id: {"incoming": [], "outgoing": []} for element in elements
        }
        for connection in project.canvas.connections:
            if connection.source_element_id in connection_map:
                connection_map[connection.source_element_id]["outgoing"].append(connection.target_element_id)
            if connection.target_element_id in connection_map:
                connection_map[connection.target_element_id]["incoming"].append(connection.source_element_id)
        return {
            "project_path": project_path,
            "project_name": project.name,
            "total_elements": total,
            "total_connections": len(project.canvas.connections),
            "page": page,
            "limit": limit,
            "has_more": start + limit < total,
            "elements": [
                {
                    "element_id": element.element_id,
                    "element_type": element.element_type,
                    "name": element.properties.get("name"),
                    "x": element.properties.get("x"),
                    "y": element.properties.get("y"),
                    "width": element.properties.get("width"),
                    "height": element.properties.get("height"),
                    "content_count": len(element.contents),
                    "active_content_id": element.active_content_id,
                    "main_content_id": element.main_content_id,
                    "status": (
                        element.get_content(element.active_content_id) or CanvasContent("", {})
                    ).fields.get("status"),
                    "parent_element_id": tree.parent_id(element.element_id),
                    "depth": tree.depth(element.element_id),
                    "child_count": len(tree.child_ids(element.element_id)),
                    **connection_map[element.element_id],
                }
                for element in page_items
            ],
        }

    async def elements(self, project_path: str, element_ids: list[str]) -> dict[str, Any]:
        """返回精确 Element 的模型友好业务 DTO 和关联连线。"""
        project = await self.repository.read(project_path)
        sidecar_warnings: list[str] = []
        try:
            baseline = await self.repository.read_sidecar(project_path, "element-details.json")
        except ValueError:
            baseline = {}
            sidecar_warnings.append("Some generated Content details are temporarily unavailable.")
        try:
            user = await self.repository.read_sidecar(project_path, "element-details-user.json")
        except ValueError:
            user = {}
            sidecar_warnings.append("Some user-provided Content details are temporarily unavailable.")
        merged_details = self.sidecar_adapter.merge(project, baseline, user)
        tree = ElementTreeIndex(project.canvas)
        requested = []
        for element_id in element_ids:
            element = project.canvas.get_element(element_id)
            if element is None:
                raise CanvasDomainError("ELEMENT_NOT_FOUND", f"Element {element_id} does not exist.")
            requested.append(element)
        selected = set(element_ids)
        connections = [
            {
                "connection_id": connection.connection_id,
                "source_element_id": connection.source_element_id,
                "target_element_id": connection.target_element_id,
            }
            for connection in project.canvas.connections
            if connection.source_element_id in selected or connection.target_element_id in selected
        ]
        return {
            "project_path": project_path,
            "details_complete": not sidecar_warnings,
            "elements": [
                self.element_details_dto(
                    element,
                    merged_details.get(element.element_id, {}),
                    connections,
                    tree,
                )
                for element in requested
            ],
            "connections": connections,
            "warnings": sidecar_warnings,
        }

    @staticmethod
    def element_details_dto(
        element: CanvasElement,
        details: dict[str, dict[str, Any]],
        connections: list[dict[str, Any]],
        tree: ElementTreeIndex,
    ) -> dict[str, Any]:
        """把持久化字段和内部详情转换为稳定 Tool DTO。"""
        layout_keys = {
            "x": "x",
            "y": "y",
            "width": "width",
            "height": "height",
            "scaleX": "scale_x",
            "scaleY": "scale_y",
            "zIndex": "z_index",
        }
        layout = {
            public_key: element.properties[stored_key]
            for stored_key, public_key in layout_keys.items()
            if stored_key in element.properties
        }
        contents = []
        for content in element.contents:
            detail = details.get(content.content_id, {})
            payload = {
                key: value
                for key, value in content.fields.items()
                if key
                not in {
                    "src",
                    "status",
                    "errorMessage",
                    "generateImageRequest",
                    "generateVideoRequest",
                    "imageGenerationTaskMeta",
                    "videoGenerationResultMeta",
                }
            }
            item = {
                "content_id": content.content_id,
                "status": content.fields.get("status"),
                "asset_path": content.fields.get("src"),
                "error_message": (
                    "Generation failed; ask the user whether to retry."
                    if content.fields.get("errorMessage")
                    else None
                ),
                "source": detail.get("source"),
                "retry_count": int(detail.get("retryCount", 0)),
                "generation_task_id": detail.get("generationTaskId"),
                "generation_parameters": detail.get("generationParameters"),
                "payload": payload or None,
            }
            contents.append({key: value for key, value in item.items() if value is not None})
        return {
            "element_id": element.element_id,
            "element_type": element.element_type,
            "name": element.properties.get("name"),
            "visible": element.properties.get("visible"),
            "locked": element.properties.get("locked"),
            "opacity": element.properties.get("opacity"),
            "parent_element_id": tree.parent_id(element.element_id),
            "depth": tree.depth(element.element_id),
            "child_element_ids": tree.child_ids(element.element_id),
            "children": [
                {
                    "element_id": child.element_id,
                    "element_type": child.element_type,
                    "parent_element_id": element.element_id,
                    "depth": tree.depth(child.element_id),
                }
                for child in element.children or []
            ],
            "layout": layout,
            "active_content_id": element.active_content_id,
            "main_content_id": element.main_content_id,
            "contents": contents,
            "connections": [
                connection
                for connection in connections
                if connection["source_element_id"] == element.element_id
                or connection["target_element_id"] == element.element_id
            ],
        }
