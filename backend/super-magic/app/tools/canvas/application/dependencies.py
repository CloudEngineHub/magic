"""Canvas Application 依赖组装模型。"""

from dataclasses import dataclass

from app.tools.canvas.domain.services.element_reference_resolver import ElementReferenceResolver
from app.tools.canvas.generation import (
    CanvasGenerationResultApplier,
    GenerationCapabilityRegistry,
    GenerationExecutionStrategyRegistry,
    GenerationTaskPoller,
    GenerationTaskRepository,
    InMemoryGenerationTaskRepository,
)
from app.tools.canvas.hierarchy import HierarchyStrategyRegistry
from app.tools.canvas.infrastructure.assets import AssetGateway, WorkspaceAssetGateway
from app.tools.canvas.infrastructure.persistence.canvas_repository_interface import CanvasRepositoryInterface
from app.tools.canvas.infrastructure.persistence.element_details_adapter import ElementDetailsAdapter
from app.tools.canvas.queries import CanvasQueryService
from app.tools.canvas.repository import CanvasUnitOfWork
from app.tools.canvas.strategies import ConnectionStrategyRegistry, ContentStrategyRegistry, LayoutStrategyRegistry
from app.tools.canvas.strategies.hierarchy.interface import HierarchyStrategyInterface

_default_generation_tasks = InMemoryGenerationTaskRepository()


@dataclass
class CanvasApplicationDependencies:
    """保存 Composition Root 明确组装后的共享端口和策略。"""

    repository: CanvasRepositoryInterface
    unit_of_work: CanvasUnitOfWork
    layout_strategies: LayoutStrategyRegistry
    content_strategies: ContentStrategyRegistry
    connection_strategies: ConnectionStrategyRegistry
    sidecar_adapter: ElementDetailsAdapter
    query_service: CanvasQueryService
    generation_capabilities: GenerationCapabilityRegistry
    generation_tasks: GenerationTaskRepository
    asset_gateway: AssetGateway
    hierarchy_strategies: HierarchyStrategyRegistry
    frame_selection: HierarchyStrategyInterface
    element_references: ElementReferenceResolver
    generation_execution: GenerationExecutionStrategyRegistry
    generation_poller: GenerationTaskPoller
    generation_result_applier: CanvasGenerationResultApplier

    @classmethod
    def build(
        cls,
        repository: CanvasRepositoryInterface,
        *,
        layout_strategies: LayoutStrategyRegistry | None = None,
        content_strategies: ContentStrategyRegistry | None = None,
        connection_strategies: ConnectionStrategyRegistry | None = None,
        generation_capabilities: GenerationCapabilityRegistry | None = None,
        generation_tasks: GenerationTaskRepository | None = None,
        asset_gateway: AssetGateway | None = None,
    ) -> "CanvasApplicationDependencies":
        """在 Composition Root 显式创建默认端口和策略。"""
        hierarchy_strategies = HierarchyStrategyRegistry()
        sidecar_adapter = ElementDetailsAdapter()
        return cls(
            repository=repository,
            unit_of_work=CanvasUnitOfWork(repository),
            layout_strategies=layout_strategies or LayoutStrategyRegistry(),
            content_strategies=content_strategies or ContentStrategyRegistry(),
            connection_strategies=connection_strategies or ConnectionStrategyRegistry(),
            sidecar_adapter=sidecar_adapter,
            query_service=CanvasQueryService(repository, sidecar_adapter),
            generation_capabilities=generation_capabilities or GenerationCapabilityRegistry(workspace=repository.workspace),
            generation_tasks=generation_tasks or _default_generation_tasks,
            asset_gateway=asset_gateway or WorkspaceAssetGateway(repository.workspace),
            hierarchy_strategies=hierarchy_strategies,
            frame_selection=hierarchy_strategies.get("frame_selection"),
            element_references=ElementReferenceResolver(),
            generation_execution=GenerationExecutionStrategyRegistry(),
            generation_poller=GenerationTaskPoller(),
            generation_result_applier=CanvasGenerationResultApplier(),
        )
