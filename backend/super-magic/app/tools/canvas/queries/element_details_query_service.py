"""Canvas Element 详情查询服务。"""

from __future__ import annotations

from typing import Any

from app.tools.canvas.domain.errors import CanvasDomainError
from app.tools.canvas.domain.models import CanvasElement
from app.tools.canvas.domain.services.element_tree_index import ElementTreeIndex
from app.tools.canvas.infrastructure.persistence.element_details_adapter import ElementDetailsAdapter
from app.tools.canvas.infrastructure.persistence.canvas_repository_interface import CanvasRepositoryInterface


class ElementDetailsQueryService:
    """只负责读取精确 Element、合并 sidecar 并投影详情 DTO。"""

    def __init__(self, repository: CanvasRepositoryInterface, sidecar_adapter: ElementDetailsAdapter | None = None):
        """保存详情查询所需的仓储和 sidecar 适配器。"""
        self.repository = repository
        self.sidecar_adapter = sidecar_adapter or ElementDetailsAdapter()

    async def elements(self, project_path: str, element_ids: list[str]) -> dict[str, Any]:
        """返回精确 Element 的模型友好详情和关联连线。"""
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
                self.element_details_dto(element, merged_details.get(element.element_id, {}), connections, tree)
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
            "x": "x", "y": "y", "width": "width", "height": "height",
            "scaleX": "scale_x", "scaleY": "scale_y", "zIndex": "z_index",
        }
        layout = {
            "x": element.properties.x,
            "y": element.properties.y,
            "width": element.properties.width,
            "height": element.properties.height,
            "scale_x": element.properties.scale_x,
            "scale_y": element.properties.scale_y,
            "z_index": element.properties.z_index,
        }
        layout = {key: value for key, value in layout.items() if value is not None}
        contents = []
        for content in element.contents:
            detail = details.get(content.content_id, {})
            payload = {
                key: value
                for key, value in content.fields.to_dict().items()
                if key not in {
                    "src", "status", "errorMessage", "generateImageRequest", "generateVideoRequest",
                    "imageGenerationTaskMeta", "videoGenerationResultMeta",
                }
            }
            item = {
                "content_id": content.content_id,
                "status": content.fields.generation_status,
                "asset_path": content.fields.asset_path,
                "error_message": (
                    "Generation failed; ask the user whether to retry."
                    if content.fields.error_message else None
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
            "name": element.properties.name,
            "visible": element.properties.visible,
            "locked": element.properties.locked,
            "opacity": element.properties.opacity,
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
                connection for connection in connections
                if connection["source_element_id"] == element.element_id
                or connection["target_element_id"] == element.element_id
            ],
        }
