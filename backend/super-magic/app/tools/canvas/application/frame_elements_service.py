"""Frame 框选用例服务。"""

from __future__ import annotations

from typing import Any

from app.tools.canvas.application.support import CanvasApplicationSupport
from app.tools.canvas.domain.errors import CanvasDomainError
from app.tools.canvas.domain.models import CanvasProject
from app.tools.canvas.hierarchy import FrameSelectionRequest, HierarchyMutationPlan


class FrameElementsService(CanvasApplicationSupport):
    """Canvas FrameElementsService 用例服务。"""

    def __init__(self, dependencies):
        """绑定共享依赖。"""
        super().__init__(dependencies)

    async def frame_elements(
        self,
        project_path: str,
        items: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """将根级普通兄弟节点框选为新 Frame，并完成局部坐标转换。"""
        self.validate_unique_item_refs(items)
        current_item_ref: str | None = None

        def mutate(project: CanvasProject, metadata: dict) -> tuple[dict[str, Any], dict]:
            nonlocal current_item_ref
            results: list[dict[str, Any]] = []
            selected_ids: set[str] = set()
            for item in items:
                current_item_ref = item["item_ref"]
                request = FrameSelectionRequest(
                    item_ref=item["item_ref"],
                    element_ids=tuple(item.get("element_ids") or []),
                    name=item.get("name"),
                    padding=item.get("padding"),
                )
                if selected_ids.intersection(request.element_ids):
                    raise CanvasDomainError("FRAME_SELECTION_OVERLAP", "Frame selections in one batch cannot overlap.")
                plan = self.frame_selection.plan(project.canvas, request)
                children = [child.clone() for child in plan.children]
                plan.frame.children = children
                HierarchyMutationPlan(
                    frame=plan.frame,
                    selected_ids=plan.selected_ids,
                    root_insert_index=plan.root_insert_index,
                ).apply(project.canvas)
                selected_ids.update(plan.selected_ids)
                results.append({
                    "item_ref": item["item_ref"],
                    "frame_element_id": plan.frame.element_id,
                    "child_element_ids": [child.element_id for child in children],
                    "content_id": plan.frame.active_content_id,
                    "parent_element_id": None,
                    "depth": 0,
                    "padding": plan.padding,
                    "status": "completed",
                })
            return {"items": results}, metadata

        try:
            return await self.unit_of_work.transaction_with_sidecar(project_path, mutate)
        except CanvasDomainError as error:
            raise self.batch_error(items, current_item_ref, error) from error
