"""Canvas Application 业务用例门面。"""

from __future__ import annotations

from typing import Any

from agentlang.context.tool_context import ToolContext
from app.tools.canvas.application.add_elements_service import AddElementsService
from app.tools.canvas.application.commands import (
    AddContentCommand,
    AddElementCommand,
    ConnectionCommand,
    FrameElementsCommand,
    LayoutElementCommand,
    RetryContentCommand,
    SelectMainContentCommand,
)
from app.tools.canvas.application.connection_service import ConnectionService
from app.tools.canvas.application.content_service import ContentService
from app.tools.canvas.application.frame_elements_service import FrameElementsService
from app.tools.canvas.application.generation_submission_service import GenerationSubmissionService
from app.tools.canvas.application.initialization_service import InitializationService
from app.tools.canvas.application.layout_service import LayoutService
from app.tools.canvas.application.retry_content_service import RetryContentService
from app.tools.canvas.application.wait_generation_service import WaitGenerationService
from app.tools.canvas.infrastructure.persistence.canvas_repository_interface import CanvasRepositoryInterface
from app.tools.canvas.production.contracts import ImageSearchTask, VideoCompositionCommand, VideoPointEstimateItem
from app.tools.canvas.production.services.estimate_content_points_service import EstimateContentPointsService
from app.tools.canvas.production.services.image_search_service import ImageSearchService
from app.tools.canvas.production.services.video_composition_service import VideoCompositionService
from app.tools.canvas.queries import CanvasQueryService


class CanvasApplication:
    """Canvas 公开用例门面，只负责依赖组装和方法委托。"""

    def __init__(
        self,
        repository: CanvasRepositoryInterface,
        query_service: CanvasQueryService,
        initialization_service: InitializationService,
        add_elements_service: AddElementsService,
        frame_elements_service: FrameElementsService,
        content_service: ContentService,
        retry_content_service: RetryContentService,
        layout_service: LayoutService,
        connection_service: ConnectionService,
        wait_generation_service: WaitGenerationService,
        estimate_content_points_service: EstimateContentPointsService,
        video_composition_service: VideoCompositionService,
        image_search_service: ImageSearchService,
        generation_submission_service: GenerationSubmissionService,
    ):
        """显式接收已组装的仓储、用例服务和生成提交服务。"""
        self.repository = repository
        self.query_service = query_service
        self.initialization_service = initialization_service
        self.add_elements_service = add_elements_service
        self.frame_elements_service = frame_elements_service
        self.content_service = content_service
        self.retry_content_service = retry_content_service
        self.layout_service = layout_service
        self.connection_service = connection_service
        self.wait_generation_service = wait_generation_service
        self.estimate_content_points_service = estimate_content_points_service
        self.video_composition_service = video_composition_service
        self.image_search_service = image_search_service
        self.generation_submission_service = generation_submission_service

    async def initialize(self, project_path: str) -> dict[str, Any]:
        """创建或复用一个 Canvas 项目。"""
        return await self.initialization_service.initialize(project_path)

    async def overview(self, project_path: str, page: int, limit: int) -> dict[str, Any]:
        """返回分页的轻量 Element 概览。"""
        return await self.query_service.overview(project_path, page, limit)

    async def elements(self, project_path: str, element_ids: list[str]) -> dict[str, Any]:
        """返回精确 Element 的模型友好业务 DTO 和关联连线。"""
        return await self.query_service.elements(project_path, element_ids)

    async def add_elements(self, project_path: str, items: list[AddElementCommand], tool_context: ToolContext | None = None) -> dict[str, Any]:
        """创建 Element，并按请求组装 Content、布局和初始 Connection。"""
        return await self.add_elements_service.add_elements(project_path, items, tool_context)

    async def frame_elements(self, project_path: str, items: list[FrameElementsCommand]) -> dict[str, Any]:
        """将符合条件的同层级节点框选为新 Frame。"""
        return await self.frame_elements_service.frame_elements(project_path, items)

    async def add_contents(self, project_path: str, items: list[AddContentCommand], tool_context: ToolContext | None = None) -> dict[str, Any]:
        """向已有 Element 追加 Content 版本。"""
        return await self.content_service.add_contents(project_path, items, tool_context)

    async def select_main(self, project_path: str, items: list[SelectMainContentCommand]) -> dict[str, Any]:
        """只修改用户明确选择的 main Content 指针。"""
        return await self.content_service.select_main(project_path, items)

    async def layout(self, project_path: str, items: list[LayoutElementCommand]) -> dict[str, Any]:
        """按可插拔布局策略调整 Element 布局。"""
        return await self.layout_service.layout(project_path, items)

    async def connections(self, project_path: str, items: list[ConnectionCommand]) -> dict[str, Any]:
        """新增、按 ID 删除或原子替换 Connection。"""
        return await self.connection_service.connections(project_path, items)

    async def retry_content(self, project_path: str, items: list[RetryContentCommand], tool_context: ToolContext | None = None) -> dict[str, Any]:
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

    async def estimate_content_points(
        self,
        project_path: str,
        production_rule: str,
        items: list[VideoPointEstimateItem],
        tool_context: ToolContext | None = None,
    ) -> dict[str, object]:
        """预估内容产出积分，不产生任何 Canvas 写入。"""
        result = await self.estimate_content_points_service.estimate(
            project_path,
            production_rule,
            items,
            tool_context,
        )
        return {
            "production_rule": result.production_rule,
            "items": [
                {
                    "item_ref": item.item_ref,
                    "status": item.status,
                    "points": item.points,
                    "reason": item.reason,
                    "request_fingerprint": item.request_fingerprint,
                }
                for item in result.items
            ],
            "total_points": result.total_points,
            "estimate_id": result.estimate_id,
            "can_continue": result.can_continue,
            "request_fingerprints": result.request_fingerprints,
        }

    async def compose_video(
        self,
        project_path: str,
        command: VideoCompositionCommand,
        tool_context: ToolContext | None = None,
    ) -> dict[str, object]:
        """执行 Video Edit 到最终 Video Content 的同步合成。"""
        return await self.video_composition_service.compose(
            project_path,
            command.video_edit_element_id,
            command.result_name,
            command.result_element_id,
            tool_context,
        )

    async def search_images(
        self,
        project_path: str,
        topic_id: str,
        tasks: list[ImageSearchTask],
        tool_context: ToolContext | None = None,
    ) -> dict[str, object]:
        """搜索图片并将成功候选物化为 imported Image Content。"""
        return await self.image_search_service.search_and_import(project_path, topic_id, tasks, tool_context)
