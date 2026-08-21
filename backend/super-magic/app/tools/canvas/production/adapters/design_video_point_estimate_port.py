"""Canvas 旧 Design 视频积分预估适配器。"""

from __future__ import annotations

import math
from pathlib import Path

from agentlang.context.tool_context import ToolContext
from app.infrastructure.magic_service.client import MagicServiceClient
from app.tools.canvas.generation.adapters.design_video_payload_builder import DesignVideoPayloadBuilder
from app.tools.canvas.production.contracts import NormalizedVideoProductionRequest
from app.tools.canvas.production.ports.video_point_estimate_port import VideoPointEstimatePort


class DesignVideoPointEstimatePort(VideoPointEstimatePort):
    """调用旧 Design API 的视频积分预估接口。"""

    def __init__(self, workspace: Path) -> None:
        """保存请求转换器和 Magic Service 客户端。"""
        self._payload_builder = DesignVideoPayloadBuilder(workspace)
        self._client = MagicServiceClient()

    async def estimate_points(
        self,
        request: NormalizedVideoProductionRequest,
        tool_context: ToolContext | None,
    ) -> int | float:
        """构造 Design 视频请求并返回有效积分。"""
        payload = self._payload_builder.build(
            request.project_path,
            request.parameters,
            video_id="",
            file_dir="",
            tool_context=tool_context,
        )
        response = await self._client.estimate_design_video_points(payload)
        points = response.get("points")
        if isinstance(points, bool) or not isinstance(points, (int, float)) or not math.isfinite(points) or points < 0:
            raise ValueError("Design video point estimate is missing valid points.")
        return points
