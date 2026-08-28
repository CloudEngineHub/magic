"""视频制作媒体生成工具公共基类。"""

from __future__ import annotations

from pathlib import Path
from typing import Generic, Sequence, TypeVar

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.tools.core import BaseToolParams
from app.tools.design.manager.canvas_manager_protocol import CanvasManagerProtocol
from app.tools.design.tools.video_production_base import BaseVideoProductionTool
from app.tools.design.video_production.service.media_generation_service import (
    MediaGenerationService,
    MediaSourceInput,
    PreparedMediaSource,
)

ParamsT = TypeVar("ParamsT", bound=BaseToolParams)


class BaseVideoProductionMediaTool(BaseVideoProductionTool[ParamsT], Generic[ParamsT]):
    """封装参考素材解析和生成结果整理。"""

    async def _prepare_source_references(
        self,
        manager: CanvasManagerProtocol,
        project_path: Path,
        tool_context: ToolContext,
        source_inputs: Sequence[MediaSourceInput],
    ) -> list[PreparedMediaSource]:
        """准备可供模型生成使用的参考素材快照，不推断画布业务关系。"""
        return await MediaGenerationService.prepare_source_references(
            manager,
            project_path,
            self._get_runtime_workspace_dir(tool_context),
            source_inputs,
        )

    @staticmethod
    def _merge_connections(
        result: ToolResult,
        connections: list[dict[str, str]],
    ) -> ToolResult:
        """把内部业务关系摘要合并到结构化结果，不向模型暴露维护细节。"""
        result.data = {**(result.data or {}), "connections": connections}
        return result
