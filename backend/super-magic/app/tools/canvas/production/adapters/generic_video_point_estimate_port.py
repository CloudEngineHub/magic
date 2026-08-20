"""通用视频积分预估适配器。"""

from pathlib import Path

from agentlang.context.tool_context import ToolContext
from app.tools.canvas.generation.adapters.project_identity_resolver import ProjectIdentityResolver
from app.tools.canvas.production.contracts import NormalizedVideoProductionRequest
from app.tools.canvas.production.ports.video_point_estimate_port import VideoPointEstimatePort


class GenericVideoPointEstimatePort(VideoPointEstimatePort):
    """复用通用视频工具的稳定请求构造和预估能力。"""

    def __init__(self, workspace: Path) -> None:
        """保存工作区并创建项目身份解析器。"""
        self._workspace = workspace
        self._project_identity_resolver = ProjectIdentityResolver()

    async def estimate_points(
        self,
        request: NormalizedVideoProductionRequest,
        tool_context: ToolContext | None,
    ) -> int | float:
        """调用无副作用预估分支并读取积分。"""
        from app.tools.generate_video import GenerateVideo, GenerateVideoParams

        parameters = request.parameters
        project = self._project_identity_resolver.resolve(request.project_path)
        extensions = dict(parameters.extensions)
        extensions.setdefault("project_path", project.project_path)
        result = await GenerateVideo(base_dir=self._workspace).execute_purely(
            tool_context,
            GenerateVideoParams(
                action="estimate_points",
                prompt=parameters.prompt,
                model_id=str(parameters.model_id or ""),
                video_name=str(parameters.name or request.item_ref),
                output_path=str(parameters.output_path or f"{project.project_path}/videos"),
                reference_image_paths=list(parameters.reference_image_paths),
                reference_video_paths=list(parameters.reference_video_paths),
                reference_audio_paths=list(parameters.reference_audio_paths),
                frame_start_path=str(parameters.frame_start_path or ""),
                frame_end_path=str(parameters.frame_end_path or ""),
                size=str(parameters.size or ""),
                duration_seconds=parameters.duration_seconds,
                aspect_ratio=str(parameters.aspect_ratio or ""),
                resolution=str(parameters.resolution or ""),
                fps=parameters.fps,
                seed=parameters.seed,
                watermark=parameters.watermark,
                extensions=extensions,
            ),
        )
        points = (result.data or {}).get("points")
        if not result.ok or not isinstance(points, (int, float)) or isinstance(points, bool):
            raise ValueError(result.content or "Video point estimate is unavailable.")
        return points
