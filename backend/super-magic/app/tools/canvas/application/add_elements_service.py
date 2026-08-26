"""新增 Canvas Element 用例服务。"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from agentlang.context.tool_context import ToolContext
from app.tools.canvas.application.canvas_id import new_canvas_id
from app.tools.canvas.application.commands import (
    AddElementCommand,
    ContentCommand,
    GenerationParameters,
    GenerationSubmissionCommand,
    LayoutCommand,
)
from app.tools.canvas.application.content_preparation_service import ContentPreparationService, PreparedContentCommand
from app.tools.canvas.application.element_sizing_service import CanvasElementSizingService
from app.tools.canvas.application.results import AddElementResultItem, AddElementsResult
from app.tools.canvas.application.support import CanvasApplicationOperations
from app.tools.canvas.domain.content_fields.video_edit import VideoEditContentFields
from app.tools.canvas.domain.errors import CanvasDomainError
from app.tools.canvas.domain.models import CanvasContent, CanvasElement, CanvasProject, ElementProperties
from app.tools.canvas.domain.services import ElementReferenceResolver, VideoEditContentValidator
from app.tools.canvas.infrastructure.persistence.canvas_codec import SUPPORTED_ELEMENT_TYPES
from app.tools.canvas.production.services.video_composition_service import VideoCompositionService
from app.tools.canvas.production.contracts.composition_output import CompositionOutput
from app.tools.canvas.production.contracts.video_composition_models import CompositionInputSpec
from app.tools.canvas.repository import CanvasUnitOfWork
from app.tools.canvas.strategies import ConnectionStrategyRegistry, LayoutStrategyRegistry


@dataclass(frozen=True)
class _CompositionRequest:
    """保存一次最终视频导出的完整请求，避免依赖后续主 Content 变化。"""

    item_ref: str
    result_element_id: str
    result_content_id: str
    video_edit_element_id: str
    composition_output: CompositionOutput
    input_spec: CompositionInputSpec | None
    result_name: str


class AddElementsService:
    """Canvas AddElementsService 用例服务。"""

    def __init__(self, unit_of_work: CanvasUnitOfWork, layout_strategies: LayoutStrategyRegistry, connection_strategies: ConnectionStrategyRegistry, element_references: ElementReferenceResolver, content_preparation: ContentPreparationService, generation_submission_service, element_sizing: CanvasElementSizingService, video_composition_service: VideoCompositionService):
        """显式绑定新增 Element 所需的端口、策略和生成提交服务。"""
        self.unit_of_work = unit_of_work
        self.layout_strategies = layout_strategies
        self.connection_strategies = connection_strategies
        self.element_references = element_references
        self.content_preparation = content_preparation
        self.generation_submission_service = generation_submission_service
        self.element_sizing = element_sizing
        self.video_composition_service = video_composition_service

    async def add_elements(
        self,
        project_path: str,
        items: Sequence[AddElementCommand],
        tool_context: ToolContext | None = None,
    ) -> AddElementsResult:
        """创建 Element，并按请求组装 Content、布局和初始 Connection。"""
        generated: list[GenerationSubmissionCommand] = []
        compositions: list[_CompositionRequest] = []
        prepared_contents: list[PreparedContentCommand] = []
        item_list = tuple(items)
        CanvasApplicationOperations.validate_unique_item_refs(item_list)
        current_item_ref: str | None = None

        async def mutate(project: CanvasProject, metadata: dict) -> tuple[AddElementsResult, dict]:
            nonlocal current_item_ref
            created: dict[str, str] = {}
            created_element_ids: list[str] = []
            results: list[AddElementResultItem] = []
            layout_requests: list[tuple[str, CanvasElement, LayoutCommand | None, int]] = []
            video_edit_contents: list[tuple[str, CanvasElement, VideoEditContentFields]] = []
            for batch_index, item in enumerate(item_list):
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
                if element.element_type == "video-edit" and content is None:
                    raise CanvasDomainError("VIDEO_EDIT_CONTENT_REQUIRED", "Video Edit Element requires Content.")
                if element.element_type in {"frame", "group"}:
                    if content is not None:
                        raise CanvasDomainError("FRAME_CONTENT_MANAGED_INTERNAL", "Frame and Group Content is managed internally.")
                    content_id = new_canvas_id("content")
                    from app.tools.canvas.domain.content_fields import ContentFieldsFactory
                    element.contents.append(CanvasContent(content_id, ContentFieldsFactory.empty(item.element_type)))
                    element.active_content_id = content_id
                    element.main_content_id = content_id
                    element.children = []
                composition_content = content if content is not None and content.is_composition else None
                if composition_content is not None:
                    if element.element_type != "video" or not composition_content.composition_video_edit_element_id:
                        raise CanvasDomainError(
                            "CONTENT_INPUT_INVALID",
                            "Composition Content requires a video Element and video-edit source.",
                        )
                generated_content_id = None
                materialized_asset_path: str | None = None
                if content is not None:
                    if content.content_id is None:
                        content = ContentCommand(
                            source=content.source,
                            content_type=content.content_type,
                            fields=content.fields,
                            asset_path=content.asset_path,
                            generation_parameters=content.generation_parameters,
                            composition_video_edit_element_id=content.composition_video_edit_element_id,
                            composition_output=content.composition_output,
                            content_id=new_canvas_id("content"),
                        )
                    prepared = await self.content_preparation.prepare_imported(content, project_path)
                    prepared_contents.append(prepared)
                    content = prepared.command
                    materialized_asset_path = content.asset_path if content.is_imported else None
                    if content.is_imported:
                        reused = self._find_existing_imported_element(
                            project,
                            item.element_type,
                            materialized_asset_path,
                        )
                        if reused is not None:
                            reused_element, reused_content_id = reused
                            created[item_ref] = reused_element.element_id
                            results.append(AddElementResultItem(
                                item_ref=item.item_ref,
                                element_id=reused_element.element_id,
                                content_id=reused_content_id,
                                status="reused",
                                asset_path=materialized_asset_path,
                            ))
                            continue
                    built_content = self.content_preparation.build(content, element.element_type)
                    element.contents.append(built_content)
                    if isinstance(built_content.fields, VideoEditContentFields):
                        video_edit_contents.append((item.item_ref, element, built_content.fields))
                    element.active_content_id = element.contents[0].content_id
                    element.main_content_id = element.contents[0].content_id
                    if content.is_generated:
                        generated_content_id = element.contents[0].content_id
                        if content.is_composition:
                            compositions.append(
                                _CompositionRequest(
                                    item_ref=item.item_ref,
                                    result_element_id=element.element_id,
                                    result_content_id=element.contents[0].content_id,
                                    video_edit_element_id=content.composition_video_edit_element_id or "",
                                    composition_output=content.composition_output,
                                    input_spec=None,
                                    result_name=item.name or "Canvas final video",
                                )
                            )
                        else:
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
                await self.element_sizing.initialize(project_path, element)
                project.canvas.elements.append(element)
                layout_requests.append((item.item_ref, element, item.layout, batch_index))
                created[item_ref] = element_id
                created_element_ids.append(element_id)
                results.append(AddElementResultItem(
                    item_ref=item_ref,
                    element_id=element_id,
                    content_id=generated_content_id or (element.contents[0].content_id if element.contents else None),
                    status="pending" if generated_content_id else "completed",
                    asset_path=materialized_asset_path,
                ))
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
            for item_ref, element, video_edit_fields in video_edit_contents:
                current_item_ref = item_ref
                VideoEditContentValidator.validate(
                    project,
                    element.element_id,
                    video_edit_fields,
                )
            for item_ref, element, layout, batch_index in layout_requests:
                current_item_ref = item_ref
                request = layout or LayoutCommand(strategy="row_incremental")
                self.layout_strategies.get(request.strategy).apply(
                    project.canvas,
                    element,
                    request,
                    batch_index,
                )
            for index, request in enumerate(compositions):
                video_edit = project.canvas.get_element(request.video_edit_element_id)
                if video_edit is None or video_edit.element_type != "video-edit":
                    raise CanvasDomainError(
                        "ELEMENT_NOT_FOUND",
                        f"The requested Video Edit Element does not exist: {request.video_edit_element_id}.",
                    )
                selected_content = video_edit.get_content(video_edit.main_content_id)
                if selected_content is None or not isinstance(selected_content.fields, VideoEditContentFields):
                    raise CanvasDomainError(
                        "VIDEO_COMPOSITION_FAILED",
                        "Video Edit Content does not exist or is not usable.",
                    )
                compositions[index] = _CompositionRequest(
                    item_ref=request.item_ref,
                    result_element_id=request.result_element_id,
                    result_content_id=request.result_content_id,
                    video_edit_element_id=request.video_edit_element_id,
                    composition_output=request.composition_output,
                    input_spec=self.video_composition_service.inspect_inputs(
                        project,
                        request.video_edit_element_id,
                        video_edit_content_id=selected_content.content_id,
                        composition_output=request.composition_output,
                    ),
                    result_name=request.result_name,
                )
            return AddElementsResult(results, created_element_ids), metadata

        try:
            result = await self.unit_of_work.transaction_with_sidecar(
                project_path,
                mutate,
                on_rollback=lambda: self.content_preparation.discard_materialized(prepared_contents),
            )
        except CanvasDomainError as error:
            raise CanvasApplicationOperations.batch_error(list(item_list), current_item_ref, error) from error
        result = await self.generation_submission_service.submit_generated(project_path, result, generated, tool_context)
        result_items = {item.item_ref: item for item in result.items}
        for composition in compositions:
            target = result_items[composition.item_ref]
            try:
                composed = await self.video_composition_service.compose(
                    project_path,
                    composition.result_name,
                    composition.result_element_id,
                    tool_context,
                    result_content_id=composition.result_content_id,
                    input_spec=composition.input_spec,
                )
                target.content_id = composed.result_content_id
                target.status = composed.status
                target.output_uri = composed.src
            except Exception as error:
                target.status = "failed"
                target.error = str(error)
        return result

    @staticmethod
    def _find_existing_imported_element(
        project: CanvasProject,
        element_type: str,
        asset_path: str | None,
    ) -> tuple[CanvasElement, str] | None:
        """按媒体类型和规范化项目路径查找可复用的已有素材 Element。"""
        normalized_path = AddElementsService._normalize_asset_path(asset_path)
        if not normalized_path:
            return None
        for element in project.canvas.iter_elements():
            if element.element_type != element_type:
                continue
            for content in element.contents:
                content_path = AddElementsService._normalize_asset_path(
                    getattr(content.fields, "asset_path", None)
                )
                if content_path == normalized_path:
                    return element, content.content_id
        return None

    @staticmethod
    def _normalize_asset_path(asset_path: str | None) -> str:
        """统一项目内素材路径的分隔符和相对路径前缀。"""
        normalized = str(asset_path or "").strip().replace("\\", "/")
        while normalized.startswith("./"):
            normalized = normalized[2:]
        return normalized.casefold()
