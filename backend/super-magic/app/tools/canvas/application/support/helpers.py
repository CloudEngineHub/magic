"""Canvas Application Service 共享边界辅助。"""

from __future__ import annotations

from typing import Any

from app.tools.canvas.application.support.atomic_batch_guard import AtomicBatchGuard
from app.tools.canvas.infrastructure.persistence.content_metadata_service import ContentMetadataService
from app.tools.canvas.domain.errors import CanvasDomainError
from app.tools.canvas.domain.models import CanvasConnection, CanvasContent, CanvasElement, CanvasProject
from app.tools.canvas.domain.services.element_tree_index import ElementTreeIndex
from app.tools.canvas.generation import CanvasGenerationResultApplier
from app.tools.canvas.queries import CanvasQueryService

from app.tools.canvas.application.dependencies import CanvasApplicationDependencies
from app.tools.canvas.application.commands import ContentCommand, LayoutCommand
from app.tools.canvas.domain.content_fields import GeneratedMediaContentFields


class CanvasApplicationSupport:
    """为各用例 Service 提供统一的依赖引用和小粒度辅助方法。"""

    def __init__(self, dependencies: CanvasApplicationDependencies):
        """绑定由 Composition Root 创建的依赖，不创建新的业务组件。"""
        self.dependencies = dependencies
        for name, value in vars(dependencies).items():
            setattr(self, name, value)

    @staticmethod
    def get_content_detail(metadata: dict, element_id: str, content_id: str) -> dict[str, Any]:
        """读取 Content 级 sidecar 详情。"""
        return ContentMetadataService.get(metadata, element_id, content_id)

    @staticmethod
    def set_content_detail(metadata: dict, element_id: str, content_id: str, detail: dict[str, Any]) -> None:
        """按 Element -> Content 标准结构写入 sidecar 详情。"""
        ContentMetadataService.set(metadata, element_id, content_id, detail)

    @staticmethod
    def new_content_detail(element_id: str, data: dict[str, Any]) -> dict[str, Any]:
        """创建不进入主协议的 Content 来源与生成尝试详情。"""
        return ContentMetadataService.new_detail(element_id, data)

    @staticmethod
    def validate_unique_item_refs(items: list[object]) -> None:
        """保证批次关联标签唯一。"""
        AtomicBatchGuard.validate_item_refs(items)

    @staticmethod
    def batch_error(items: list[object], failed_item_ref: str | None, error: CanvasDomainError) -> CanvasDomainError:
        """把多项原子批量异常转换为逐项结果。"""
        return AtomicBatchGuard.map_error(items, failed_item_ref, error)

    @staticmethod
    def merge_generation_override(
        element_type: str,
        original: dict[str, Any],
        override: dict[str, Any] | None,
    ) -> dict[str, Any]:
        """只允许覆盖生成能力公开的输入字段。"""
        return ContentMetadataService.merge_generation_override(element_type, original, override)

    @staticmethod
    def start_retry_detail(
        element_id: str,
        detail: dict[str, Any],
        retry_count: int,
        parameters: dict[str, Any],
        idempotency_key: str,
    ) -> dict[str, Any]:
        """归档上一次终态并创建新的重试详情。"""
        return ContentMetadataService.start_retry(element_id, detail, retry_count, parameters, idempotency_key)

    @staticmethod
    def apply_generation_result(
        project: CanvasProject,
        element_id: str,
        content_id: str,
        status: str,
        output_uri: str | None,
        error_message: str | None,
    ) -> None:
        """把生成终态委托给独立结果回写器。"""
        CanvasGenerationResultApplier.apply(project, element_id, content_id, status, output_uri, error_message)

    def build_content(self, command: ContentCommand, element_type: str) -> CanvasContent:
        """把模型输入转换为主协议允许的 Content 字段。"""
        return self.content_strategies.build(command, element_type)

    async def prepare_imported_content(self, project: CanvasProject, command: ContentCommand) -> ContentCommand:
        """规范化 imported 素材路径并阻止同一素材重复登记。"""
        if command.source != "imported":
            return command
        asset_path = str(command.asset_path or "")
        normalized = await self.asset_gateway.normalize_existing_file(asset_path)
        existing_paths = {
            str(content.fields.asset_path)
            for element in project.canvas.iter_elements()
            for content in element.contents
            if content.fields.asset_path
        }
        if normalized in existing_paths:
            raise CanvasDomainError("ASSET_ALREADY_REGISTERED", f"Imported asset is already registered: {normalized}.")
        if hasattr(command.fields, "src"):
            command.fields.src = normalized
        return command

    def apply_layout(self, project: CanvasProject, element: CanvasElement, layout: LayoutCommand | None, index: int) -> None:
        """按当前请求选择布局策略并应用计划。"""
        request = layout or LayoutCommand(strategy="row_incremental")
        self.layout_strategies.get(request.strategy).apply(project.canvas, element, request, index)

    @staticmethod
    def get_connection(project: CanvasProject, connection_id: str) -> CanvasConnection | None:
        """按 Connection ID 查找关系。"""
        return next((item for item in project.canvas.connections if item.connection_id == connection_id), None)

    def add_connection(self, project: CanvasProject, source: str, target: str) -> CanvasConnection:
        """校验并新增一条 Connection，重复边按幂等结果返回。"""
        if project.canvas.get_element(source) is None or project.canvas.get_element(target) is None:
            raise CanvasDomainError("ELEMENT_NOT_FOUND", "Connection endpoints must reference existing Elements.")
        if source == target:
            raise CanvasDomainError("INVALID_CONNECTION", "A Connection cannot point to the same Element.")
        existing = next(
            (item for item in project.canvas.connections if item.source_element_id == source and item.target_element_id == target),
            None,
        )
        if existing is not None:
            return existing
        return self.connection_strategies.plan(project.canvas, source, target).apply(project.canvas)

    @staticmethod
    def element_details_dto(
        element: CanvasElement,
        details: dict[str, dict[str, Any]],
        connections: list[dict[str, Any]],
        tree: ElementTreeIndex,
    ) -> dict[str, Any]:
        """兼容旧调用方，委托给独立查询服务。"""
        return CanvasQueryService.element_details_dto(element, details, connections, tree)
