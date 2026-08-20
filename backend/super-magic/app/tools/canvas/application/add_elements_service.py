"""新增 Canvas Element 用例服务。"""

from __future__ import annotations

from typing import Any

from agentlang.context.tool_context import ToolContext

from app.tools.canvas.application.dependencies import new_canvas_id
from app.tools.canvas.application.support import CanvasApplicationSupport
from app.tools.canvas.infrastructure.persistence.canvas_codec import SUPPORTED_ELEMENT_TYPES
from app.tools.canvas.domain.errors import CanvasDomainError
from app.tools.canvas.domain.models import CanvasContent, CanvasElement, CanvasProject
from app.tools.canvas.hierarchy import HierarchyMutationPlan


class AddElementsService(CanvasApplicationSupport):
    """Canvas AddElementsService 用例服务。"""

    def __init__(self, dependencies, generation_submission_service):
        """绑定共享依赖和生成提交服务。"""
        super().__init__(dependencies)
        self.generation_submission_service = generation_submission_service

    async def add_elements(
        self,
        project_path: str,
        items: list[dict[str, Any]],
        tool_context: ToolContext | None = None,
    ) -> dict[str, Any]:
        """创建 Element，并按请求组装 Content、布局和初始 Connection。"""
        generated: list[dict[str, Any]] = []
        self.validate_unique_item_refs(items)
        current_item_ref: str | None = None

        async def mutate(project: CanvasProject, metadata: dict) -> tuple[dict[str, Any], dict]:
            nonlocal current_item_ref
            created: dict[str, str] = {}
            results: list[dict[str, Any]] = []
            layout_requests: list[tuple[CanvasElement, dict[str, Any] | None]] = []
            for item in items:
                item_ref = item["item_ref"]
                current_item_ref = item_ref
                if item.get("element_type") not in SUPPORTED_ELEMENT_TYPES:
                    raise CanvasDomainError(
                        "INVALID_ELEMENT",
                        f"Element type {item.get('element_type')} is unsupported.",
                    )
                element_id = item.get("element_id") or new_canvas_id("element")
                if project.canvas.get_element(element_id) is not None:
                    raise CanvasDomainError("ELEMENT_ALREADY_EXISTS", f"Element {element_id} already exists.")
                element = CanvasElement(
                    element_id=element_id,
                    element_type=item["element_type"],
                    properties={"name": item.get("name")} if item.get("name") else {},
                )
                content = item.get("content")
                if element.element_type in {"frame", "group"}:
                    if content is not None:
                        raise CanvasDomainError("FRAME_CONTENT_MANAGED_INTERNAL", "Frame and Group Content is managed internally.")
                    content_id = new_canvas_id("content")
                    element.contents.append(CanvasContent(content_id, {}))
                    element.active_content_id = content_id
                    element.main_content_id = content_id
                    element.children = []
                generated_content_id = None
                if content:
                    content = dict(content)
                    await self.prepare_imported_content(project, content)
                    content.setdefault("content_id", new_canvas_id("content"))
                    element.contents.append(self.build_content(content, element.element_type))
                    element.active_content_id = element.contents[0].content_id
                    element.main_content_id = element.contents[0].content_id
                    if content.get("source") == "generated":
                        self.generation_capabilities.get(
                            element.element_type,
                            content.get("model_id"),
                        )
                        generated_content_id = element.contents[0].content_id
                        generated.append({
                            "element_id": element.element_id,
                            "content_id": element.contents[0].content_id,
                            "element_type": element.element_type,
                            "parameters": content,
                        })
                    self.set_content_detail(
                        metadata,
                        element.element_id,
                        element.contents[0].content_id,
                        self.new_content_detail(element.element_id, content),
                    )
                project.canvas.elements.append(element)
                layout_requests.append((element, item.get("layout")))
                created[item_ref] = element_id
                results.append({"item_ref": item_ref, "element_id": element_id, "content_id": generated_content_id or (element.contents[0].content_id if element.contents else None), "status": "pending" if generated_content_id else "completed"})
            for item in items:
                current_item_ref = item["item_ref"]
                current_element_id = created.get(item["item_ref"])
                for relation in item.get("connections", []):
                    source_id = relation.get("source_element_id") or self.element_references.resolve(
                        relation.get("source_item_ref"),
                        created,
                    )
                    target_id = relation.get("target_element_id") or self.element_references.resolve(
                        relation.get("target_item_ref"),
                        created,
                    )
                    if relation.get("source_element_id") or relation.get("source_item_ref"):
                        target_id = current_element_id
                    elif relation.get("target_element_id") or relation.get("target_item_ref"):
                        source_id = current_element_id
                    if not source_id or not target_id:
                        raise CanvasDomainError("INVALID_CONNECTION", "Connection reference could not be resolved.")
                    self.add_connection(project, source_id, target_id)
            for index, (element, layout) in enumerate(layout_requests):
                current_item_ref = items[index]["item_ref"]
                self.apply_layout(project, element, layout, index)
            return {"items": results, "created_element_ids": list(created.values())}, metadata

        try:
            result = await self.unit_of_work.transaction_with_sidecar(project_path, mutate)
        except CanvasDomainError as error:
            raise self.batch_error(items, current_item_ref, error) from error
        return await self.generation_submission_service.submit_generated(project_path, result, generated, tool_context)
