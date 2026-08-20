"""通用生视频能力适配器。"""

import uuid
from pathlib import Path

from agentlang.context.tool_context import ToolContext

from app.tools.canvas.generation.adapters.project_identity_resolver import ProjectIdentityResolver
from app.tools.canvas.generation.contracts.generation_query_request import GenerationQueryRequest
from app.tools.canvas.generation.contracts.generation_query_result import GenerationQueryResult
from app.tools.canvas.generation.contracts.generation_request import GenerationRequest
from app.tools.canvas.generation.contracts.generation_submission import GenerationSubmission
from app.tools.canvas.generation.ports.query_port import GenerationQueryPort
from app.tools.canvas.generation.ports.submission_port import GenerationSubmissionPort


class GenericVideoGenerationPort(GenerationSubmissionPort, GenerationQueryPort):
    """适配现有通用视频能力的异步提交和查询端口。"""

    execution_mode = "async"

    def __init__(self, workspace: Path):
        """保存工作区根目录。"""
        self.workspace = workspace
        self.project_identity_resolver = ProjectIdentityResolver()

    async def submit(self, request: GenerationRequest, tool_context: ToolContext | None) -> GenerationSubmission:
        """提交视频任务，不在提交阶段阻塞等待结果。"""
        from app.tools.generate_video import GenerateVideo, GenerateVideoParams

        parameters = request.parameters
        project = self.project_identity_resolver.resolve(request.project_path)
        extensions = dict(parameters.get("extensions") or {})
        extensions.setdefault("project_path", project.project_path)
        params = GenerateVideoParams(
            action="generate",
            prompt=str(parameters.get("prompt") or ""),
            model_id=str(parameters.get("model_id") or ""),
            video_name=str(parameters.get("name") or request.content_id),
            output_path=str(parameters.get("output_path") or f"{project.project_path}/videos"),
            reference_image_paths=list(parameters.get("reference_image_paths") or []),
            reference_video_paths=list(parameters.get("reference_video_paths") or []),
            reference_audio_paths=list(parameters.get("reference_audio_paths") or []),
            frame_start_path=str(parameters.get("frame_start_path") or ""),
            frame_end_path=str(parameters.get("frame_end_path") or ""),
            size=str(parameters.get("size") or ""),
            duration_seconds=parameters.get("duration_seconds"),
            aspect_ratio=str(parameters.get("aspect_ratio") or ""),
            resolution=str(parameters.get("resolution") or ""),
            fps=parameters.get("fps"),
            seed=parameters.get("seed"),
            watermark=parameters.get("watermark"),
            extensions=extensions,
        )
        result = await GenerateVideo(base_dir=self.workspace).execute_purely(tool_context, params)
        operation_id = str((result.data or {}).get("operation_id") or "").strip()
        if not result.ok or not operation_id:
            return GenerationSubmission("async", "failed", error_message=result.content)
        task_id = f"canvas-generation-{uuid.uuid4().hex}"
        return GenerationSubmission("async", "processing", generation_task_id=task_id, provider_task_id=operation_id)

    async def query(self, request: GenerationQueryRequest, tool_context: ToolContext | None) -> GenerationQueryResult:
        """查询视频任务一次并在成功时下载到项目目录。"""
        from app.tools.get_video import GetVideo, GetVideoParams

        project = self.project_identity_resolver.resolve(request.project_path)
        result = await GetVideo(base_dir=self.workspace).execute_purely(
            tool_context,
            GetVideoParams(
                operation_id=request.provider_task_id,
                wait_mode="once",
                video_name=request.content_id,
                output_path=f"{project.project_path}/videos",
            ),
        )
        data = result.data or {}
        status = str(data.get("status") or (result.extra_info or {}).get("status") or "unknown")
        if not result.ok:
            return GenerationQueryResult("failed", error_message=result.content)
        if status in {"succeeded", "completed"}:
            return GenerationQueryResult("completed", output_uri=data.get("saved_video_relative_path"))
        if status in {"failed", "canceled", "cancelled"}:
            return GenerationQueryResult("failed", error_message=result.content)
        return GenerationQueryResult("processing")
