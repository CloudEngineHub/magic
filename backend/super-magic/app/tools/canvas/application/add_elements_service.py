"""新增 Canvas Element 用例服务。"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from agentlang.context.tool_context import ToolContext

from app.tools.canvas.application.canvas_id import new_canvas_id
from app.tools.canvas.application.commands import AddElementCommand, GenerationParameters, GenerationSubmissionCommand, LayoutCommand
from app.tools.canvas.application.support import CanvasApplicationOperations
from app.tools.canvas.application.content_preparation_service import ContentPreparationService
from app.tools.canvas.domain.services.element_reference_resolver import ElementReferenceResolver
from app.tools.canvas.generation import GenerationCapabilityRegistry
from app.tools.canvas.repository import CanvasUnitOfWork
from app.tools.canvas.strategies import ConnectionStrategyRegistry, LayoutStrategyRegistry
from app.tools.canvas.infrastructure.persistence.canvas_codec import SUPPORTED_ELEMENT_TYPES
from app.tools.canvas.domain.errors import CanvasDomainError
from app.tools.canvas.domain.models import CanvasContent, CanvasElement, CanvasProject, ElementProperties
from app.tools.canvas.hierarchy import HierarchyMutationPlan


class AddElementsService:
    """Canvas AddElementsService 用例服务。"""

    def __init__(self, unit_of_work: CanvasUnitOfWork, layout_strategies: LayoutStrategyRegistry, connection_strategies: ConnectionStrategyRegistry, generation_capabilities: GenerationCapabilityRegistry, element_references: ElementReferenceResolver, content_preparation: ContentPreparationService, generation_submission_service):
        """显式绑定新增 Element 所需的端口、策略和生成提交服务。"""
        self.unit_of_work = unit_of_work
        self.layout_strategies = layout_strategies
        self.connection_strategies = connection_strategies
        self.generation_capabilities = generation_capabilities
        self.element_references = element_references
        self.content_preparation = content_preparation
        self.generation_submission_service = generation_submission_service

    async def add_elements(
        self,
        project_path: str,
        items: Sequence[AddElementCommand],
        tool_context: ToolContext | None = None,
    ) -> dict[str, Any]:
        """创建 Element，并按请求组装 Content、布局和初始 Connection。"""
        generated: list[GenerationSubmissionCommand] = []
        item_list = tuple(items)
        CanvasApplicationOperations.validate_unique_item_refs(item_list)
        current_item_ref: str | None = None

        async def mutate(project: CanvasProject, metadata: dict) -> tuple[dict[str, Any], dict]:
            nonlocal current_item_ref
            created: dict[str, str] = {}
            results: list[dict[str, object]] = []
            layout_requests: list[tuple[CanvasElement, LayoutCommand | None]] = []
            for item in item_list:
                item_ref = item.item_ref
                current_item_ref = item_ref
                if item.element_type not in SUPPORTED_ELEMENT_TYPES:
                    raise CanvasDomainError(
                        "INVALID_ELEMENT",
                        f"Element type {item.element_type} is unsupported.",
                    )
                element_id = item.element_id or new_canvas_id("element")
                if project.canvas.get_element(element_id) is not None:
                    raise CanvasDomainError("ELEMENT_ALREADY_EXISTS", f"Element {element_id} already exists.")
                element = CanvasElement(
                    element_id=element_id,
                    element_type=item.element_type,
                    properties=ElementProperties(name=item.name),
                )
                content = item.content
                if element.element_type in {"frame", "group"}:
                    if content is not None:
                        raise CanvasDomainError("FRAME_CONTENT_MANAGED_INTERNAL", "Frame and Group Content is managed internally.")
                    content_id = new_canvas_id("content")
                    from app.tools.canvas.domain.content_fields import ContentFieldsFactory
                    element.contents.append(CanvasContent(content_id, ContentFieldsFactory.empty(item.element_type)))
                    element.active_content_id = content_id
                    element.main_content_id = content_id
                    element.children = []
                generated_content_id = None
                if content is not None:
                    if content.content_id is None:
                        content = type(content)(
                            source=content.source,
                            content_type=content.content_type,
                            fields=content.fields,
                            asset_path=content.asset_path,
                            generation_parameters=content.generation_parameters,
                            content_id=new_canvas_id("content"),
                        )
                    await self.content_preparation.prepare_imported(project, content)
                    element.contents.append(self.content_preparation.build(content, element.element_type))
                    element.active_content_id = element.contents[0].content_id
                    element.main_content_id = element.contents[0].content_id
                    if content.is_generated:
                        self.generation_capabilities.get(
                            element.element_type,
                            content.generation_parameters.model_id if content.generation_parameters else None,
                        )
                        generated_content_id = element.contents[0].content_id
                        generated.append(GenerationSubmissionCommand(
                            element_id=element.element_id,
                            content_id=element.contents[0].content_id,
                            element_type=element.element_type,
                            parameters=content.generation_parameters or GenerationParameters(),
                            item_ref=item.item_ref,
                        ))
                    CanvasApplicationOperations.set_content_detail(
                        metadata,
                        element.element_id,
                        element.contents[0].content_id,
                        CanvasApplicationOperations.new_content_detail(element.element_id, content.to_metadata()),
                    )
                project.canvas.elements.append(element)
                layout_requests.append((element, item.layout))
                created[item_ref] = element_id
                results.append({"item_ref": item_ref, "element_id": element_id, "content_id": generated_content_id or (element.contents[0].content_id if element.contents else None), "status": "pending" if generated_content_id else "completed"})
            for item in item_list:
                current_item_ref = item.item_ref
                current_element_id = created.get(item.item_ref)
                for relation in item.connections:
                    source_id = relation.source_element_id or self.element_references.resolve(
                        relation.source_item_ref,
                        created,
                    )
                    target_id = relation.target_element_id or self.element_references.resolve(
                        relation.target_item_ref,
                        created,
                    )
                    if relation.source_element_id or relation.source_item_ref:
                        target_id = current_element_id
                    elif relation.target_element_id or relation.target_item_ref:
                        source_id = current_element_id
                    if not source_id or not target_id:
                        raise CanvasDomainError("INVALID_CONNECTION", "Connection reference could not be resolved.")
                    CanvasApplicationOperations.add_connection(self.connection_strategies, project, source_id, target_id)
            for index, (element, layout) in enumerate(layout_requests):
                current_item_ref = item_list[index].item_ref
                request = layout or LayoutCommand(strategy="row_incremental")
                self.layout_strategies.get(request.strategy).apply(project.canvas, element, request, index)
            return {"items": results, "created_element_ids": list(created.values())}, metadata

        try:
            result = await self.unit_of_work.transaction_with_sidecar(project_path, mutate)
        except CanvasDomainError as error:
            raise CanvasApplicationOperations.batch_error(list(item_list), current_item_ref, error) from error
        return await self.generation_submission_service.submit_generated(project_path, result, generated, tool_context)
