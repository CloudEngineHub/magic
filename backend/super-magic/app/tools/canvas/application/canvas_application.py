"""Canvas Application 业务用例门面。"""

from __future__ import annotations

from typing import Any

from agentlang.context.tool_context import ToolContext

from app.tools.canvas.application.add_elements_service import AddElementsService
from app.tools.canvas.application.connection_service import ConnectionService
from app.tools.canvas.application.content_service import ContentService
from app.tools.canvas.application.dependencies import CanvasApplicationDependencies
from app.tools.canvas.application.frame_elements_service import FrameElementsService
from app.tools.canvas.application.generation_submission_service import GenerationSubmissionService
from app.tools.canvas.application.initialization_service import InitializationService
from app.tools.canvas.application.layout_service import LayoutService
from app.tools.canvas.application.retry_content_service import RetryContentService
from app.tools.canvas.application.support import CanvasApplicationSupport
from app.tools.canvas.application.wait_generation_service import WaitGenerationService
from app.tools.canvas.infrastructure.assets import AssetGateway
from app.tools.canvas.generation import GenerationCapabilityRegistry, GenerationTaskRepository
from app.tools.canvas.infrastructure.persistence.canvas_repository_interface import CanvasRepositoryInterface
from app.tools.canvas.strategies import ConnectionStrategyRegistry, ContentStrategyRegistry, LayoutStrategyRegistry


class CanvasApplication(CanvasApplicationSupport):
    """Canvas 公开用例门面，只负责依赖组装和方法委托。"""

    def __init__(
        self,
        repository: CanvasRepositoryInterface,
        *,
        layout_strategies: LayoutStrategyRegistry | None = None,
        content_strategies: ContentStrategyRegistry | None = None,
        connection_strategies: ConnectionStrategyRegistry | None = None,
        generation_capabilities: GenerationCapabilityRegistry | None = None,
        generation_tasks: GenerationTaskRepository | None = None,
        asset_gateway: AssetGateway | None = None,
    ):
        """组装共享依赖和各个独立用例服务。"""
        dependencies = CanvasApplicationDependencies.build(
            repository,
            layout_strategies=layout_strategies,
            content_strategies=content_strategies,
            connection_strategies=connection_strategies,
            generation_capabilities=generation_capabilities,
            generation_tasks=generation_tasks,
            asset_gateway=asset_gateway,
        )
        super().__init__(dependencies)
        self.generation_submission_service = GenerationSubmissionService(dependencies)
        self.initialization_service = InitializationService(dependencies)
        self.add_elements_service = AddElementsService(dependencies, self.generation_submission_service)
        self.frame_elements_service = FrameElementsService(dependencies)
        self.content_service = ContentService(dependencies, self.generation_submission_service)
        self.retry_content_service = RetryContentService(dependencies, self.generation_submission_service)
        self.layout_service = LayoutService(dependencies)
        self.connection_service = ConnectionService(dependencies)
        self.wait_generation_service = WaitGenerationService(dependencies)

    async def initialize(self, project_path: str) -> dict[str, Any]:
        """创建或复用一个 Canvas 项目。"""
        return await self.initialization_service.initialize(project_path)

    async def overview(self, project_path: str, page: int, limit: int) -> dict[str, Any]:
        """返回分页的轻量 Element 概览。"""
        return await self.query_service.overview(project_path, page, limit)

    async def elements(self, project_path: str, element_ids: list[str]) -> dict[str, Any]:
        """返回精确 Element 的模型友好业务 DTO 和关联连线。"""
        return await self.query_service.elements(project_path, element_ids)

    async def add_elements(self, project_path: str, items: list[dict[str, Any]], tool_context: ToolContext | None = None) -> dict[str, Any]:
        """创建 Element，并按请求组装 Content、布局和初始 Connection。"""
        return await self.add_elements_service.add_elements(project_path, items, tool_context)

    async def frame_elements(self, project_path: str, items: list[dict[str, Any]]) -> dict[str, Any]:
        """将符合条件的同层级节点框选为新 Frame。"""
        return await self.frame_elements_service.frame_elements(project_path, items)

    async def add_contents(self, project_path: str, items: list[dict[str, Any]], tool_context: ToolContext | None = None) -> dict[str, Any]:
        """向已有 Element 追加 Content 版本。"""
        return await self.content_service.add_contents(project_path, items, tool_context)

    async def select_main(self, project_path: str, items: list[dict[str, Any]]) -> dict[str, Any]:
        """只修改用户明确选择的 main Content 指针。"""
        return await self.content_service.select_main(project_path, items)

    async def layout(self, project_path: str, items: list[dict[str, Any]]) -> dict[str, Any]:
        """按可插拔布局策略调整 Element 布局。"""
        return await self.layout_service.layout(project_path, items)

    async def connections(self, project_path: str, items: list[dict[str, Any]]) -> dict[str, Any]:
        """新增、按 ID 删除或原子替换 Connection。"""
        return await self.connection_service.connections(project_path, items)

    async def retry_content(self, project_path: str, items: list[dict[str, Any]], tool_context: ToolContext | None = None) -> dict[str, Any]:
        """校验失败 Content 的受控重试边界。"""
        return await self.retry_content_service.retry_content(project_path, items, tool_context)

    async def wait(
        self,
        project_path: str,
        task_ids: list[str],
        max_wait_seconds: int = 60,
        tool_context: ToolContext | None = None,
    ) -> dict[str, Any]:
        """轮询异步任务并在终态回写 Content。"""
        return await self.wait_generation_service.wait(project_path, task_ids, max_wait_seconds, tool_context)
