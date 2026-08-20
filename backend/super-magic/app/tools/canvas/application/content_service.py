"""Content 追加和主版本选择用例服务。"""

from __future__ import annotations

from typing import Any

from agentlang.context.tool_context import ToolContext

from app.tools.canvas.application.dependencies import new_canvas_id
from app.tools.canvas.application.support import CanvasApplicationSupport
from app.tools.canvas.domain.errors import CanvasDomainError
from app.tools.canvas.domain.models import CanvasProject


class ContentService(CanvasApplicationSupport):
    """Canvas ContentService 用例服务。"""

    def __init__(self, dependencies, generation_submission_service):
        """绑定共享依赖和生成提交服务。"""
        super().__init__(dependencies)
        self.generation_submission_service = generation_submission_service

    async def add_contents(
        self,
        project_path: str,
        items: list[dict[str, Any]],
        tool_context: ToolContext | None = None,
    ) -> dict[str, Any]:
        """向已有 Element 追加 Content 版本。"""
        generated: list[dict[str, Any]] = []
        self.validate_unique_item_refs(items)
        current_item_ref: str | None = None

        async def mutate(project: CanvasProject, metadata: dict) -> tuple[dict[str, Any], dict]:
            nonlocal current_item_ref
            results = []
            for item in items:
                current_item_ref = item["item_ref"]
                element = project.canvas.get_element(item["element_id"])
                if element is None:
                    raise CanvasDomainError("ELEMENT_NOT_FOUND", f"Element {item['element_id']} does not exist.")
                if element.element_type in {"frame", "group"}:
                    raise CanvasDomainError("FRAME_CONTENT_MANAGED_INTERNAL", "Frame and Group Content is managed internally.")
                content_data = dict(item["content"])
                await self.prepare_imported_content(project, content_data)
                content_data.setdefault("content_id", new_canvas_id("content"))
                content = self.build_content(content_data, element.element_type)
                if element.get_content(content.content_id) is not None:
                    raise CanvasDomainError("CONTENT_ALREADY_EXISTS", f"Content {content.content_id} already exists.")
                element.contents.append(content)
                if len(element.contents) == 1:
                    element.active_content_id = content.content_id
                    element.main_content_id = content.content_id
                status = "pending" if content_data.get("source") == "generated" else "completed"
                if content_data.get("source") == "generated":
                    self.generation_capabilities.get(
                        element.element_type,
                        content_data.get("model_id"),
                    )
                results.append({"item_ref": item["item_ref"], "element_id": element.element_id, "content_id": content.content_id, "status": status})
                if content_data.get("source") == "generated":
                    generated.append({
                        "item_ref": item["item_ref"],
                        "element_id": element.element_id,
                        "content_id": content.content_id,
                        "element_type": element.element_type,
                        "parameters": content_data,
                    })
                self.set_content_detail(
                    metadata,
                    element.element_id,
                    content.content_id,
                    self.new_content_detail(element.element_id, content_data),
                )
            return {"items": results}, metadata

        try:
            result = await self.unit_of_work.transaction_with_sidecar(project_path, mutate)
        except CanvasDomainError as error:
            raise self.batch_error(items, current_item_ref, error) from error
        return await self.generation_submission_service.submit_generated(project_path, result, generated, tool_context)

    async def select_main(self, project_path: str, items: list[dict[str, Any]]) -> dict[str, Any]:
        """只修改用户明确选择的 main Content 指针。"""
        self.validate_unique_item_refs(items)
        current_item_ref: str | None = None
        def mutate(project: CanvasProject, metadata: dict) -> tuple[dict[str, Any], dict]:
            nonlocal current_item_ref
            results = []
            for item in items:
                current_item_ref = item["item_ref"]
                element = project.canvas.get_element(item["element_id"])
                if element is None:
                    raise CanvasDomainError("ELEMENT_NOT_FOUND", f"Element {item['element_id']} does not exist.")
                if element.element_type in {"frame", "group"}:
                    raise CanvasDomainError("FRAME_CONTENT_MANAGED_INTERNAL", "Frame and Group Content is managed internally.")
                content = element.get_content(item["content_id"])
                if content is None:
                    raise CanvasDomainError("CONTENT_NOT_FOUND", f"Content {item['content_id']} does not exist.")
                if content.fields.get("status") not in {None, "completed"}:
                    raise CanvasDomainError("MAIN_CONTENT_NOT_COMPLETED", "The selected Content is not completed.")
                previous = element.main_content_id
                element.main_content_id = content.content_id
                results.append({
                    "item_ref": item["item_ref"],
                    "status": "completed",
                    "element_id": element.element_id,
                    "previous_main_content_id": previous,
                    "main_content_id": content.content_id,
                    "active_content_id": element.active_content_id,
                })
            return {"items": results}, metadata

        try:
            return await self.unit_of_work.transaction_with_sidecar(project_path, mutate)
        except CanvasDomainError as error:
            raise self.batch_error(items, current_item_ref, error) from error
