"""视频生产媒体节点的预占初始化实现。"""

from __future__ import annotations

from typing import Any, Dict, Sequence

from app.tools.design.domain.generation_initializer import (
    CanvasGenerationInitializationContext,
    CanvasGenerationInitializer,
)
from app.tools.design.video_production.service.video_production_layout_service import (
    VideoProductionLayoutService,
)


class VideoProductionGenerationInitializer(CanvasGenerationInitializer):
    """在生成开始前一次性确定本批新增媒体节点的位置。"""

    @staticmethod
    def layout_elements(config: Any, element_ids: Sequence[str]) -> None:
        """统一为指定的新增视频生产节点执行增量布局。"""
        VideoProductionLayoutService.layout_new_elements(
            config.canvas,
            element_ids,
        )

    async def apply_batch(
        self,
        config: Any,
        contexts: Sequence[CanvasGenerationInitializationContext],
    ) -> Dict[int, Dict[str, Any]]:
        """只布局本批新建 Element，并保持已有 Element 完全不变。"""
        self.layout_elements(
            config,
            [context.element_id for context in contexts if context.element_created],
        )
        return {context.task_index: {} for context in contexts}

    def get_connections(self) -> list[dict[str, str]]:
        """普通媒体预占不创建业务关系。"""
        return []

    def discard(self, task_indices: Sequence[int]) -> None:
        """布局没有事务外摘要，提交失败时无需额外清理。"""
