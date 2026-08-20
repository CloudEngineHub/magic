"""Canvas 布局用例服务。"""

from __future__ import annotations

from typing import Any

from app.tools.canvas.application.support import CanvasApplicationSupport
from app.tools.canvas.domain.errors import CanvasDomainError
from app.tools.canvas.domain.models import CanvasProject


class LayoutService(CanvasApplicationSupport):
    """Canvas LayoutService 用例服务。"""

    def __init__(self, dependencies):
        """绑定共享依赖。"""
        super().__init__(dependencies)

    async def layout(self, project_path: str, items: list[dict[str, Any]]) -> dict[str, Any]:
        """按可插拔布局策略调整 Element 布局。"""
        self.validate_unique_item_refs(items)
        current_item_ref: str | None = None
        def mutate(project: CanvasProject, metadata: dict) -> tuple[dict[str, Any], dict]:
            nonlocal current_item_ref
            results = []
            for index, item in enumerate(items):
                current_item_ref = item["item_ref"]
                element = project.canvas.get_element(item["element_id"])
                if element is None:
                    raise CanvasDomainError("ELEMENT_NOT_FOUND", f"Element {item['element_id']} does not exist.")
                self.apply_layout(project, element, item["layout"], index)
                results.append({
                    "item_ref": item["item_ref"],
                    "status": "completed",
                    "element_id": element.element_id,
                    "strategy": item["layout"]["strategy"],
                })
            return {"items": results}, metadata

        try:
            return await self.unit_of_work.transaction_with_sidecar(project_path, mutate)
        except CanvasDomainError as error:
            raise self.batch_error(items, current_item_ref, error) from error
