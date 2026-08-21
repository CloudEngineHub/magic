"""Canvas 旧 Design 视频接口适配器。"""

from __future__ import annotations

import uuid
from pathlib import Path

from agentlang.context.tool_context import ToolContext
from agentlang.logger import get_logger
from app.infrastructure.magic_service.client import MagicServiceClient
from app.tools.canvas.generation.adapters.design_video_payload_builder import DesignVideoPayloadBuilder
from app.tools.canvas.generation.adapters.project_identity_resolver import ProjectIdentityResolver
from app.tools.canvas.generation.contracts.generation_query_request import GenerationQueryRequest
from app.tools.canvas.generation.contracts.generation_query_result import GenerationQueryResult
from app.tools.canvas.generation.contracts.generation_request import GenerationRequest
from app.tools.canvas.generation.contracts.generation_submission import GenerationSubmission
from app.tools.canvas.generation.video_filename import build_video_filename
from app.tools.canvas.generation.ports.query_port import GenerationQueryPort
from app.tools.canvas.generation.ports.submission_port import GenerationSubmissionPort
from app.tools.canvas.infrastructure.assets import ProjectAssetPathResolver

logger = get_logger(__name__)


class DesignVideoGenerationPort(GenerationSubmissionPort, GenerationQueryPort):
    """通过 POST/GET Design API 提交和查询 Canvas 视频任务。"""

    execution_mode = "async"

    def __init__(self, workspace: Path) -> None:
        """创建请求转换、项目路径和 Magic Service 依赖。"""
        self.workspace = workspace
        self._client = MagicServiceClient()
        self._payload_builder = DesignVideoPayloadBuilder(workspace)
        self._project_identity_resolver = ProjectIdentityResolver()
        self._asset_path_resolver = ProjectAssetPathResolver(workspace)

    async def submit(self, request: GenerationRequest, tool_context: ToolContext | None) -> GenerationSubmission:
        """提交 Design 视频任务并保存服务返回的视频 ID。"""
        provider_task_id = f"vid_{uuid.uuid4().hex[:16]}"
        try:
            project = self._project_identity_resolver.resolve(request.project_path)
            output_filename = build_video_filename(request.parameters.name, provider_task_id, request.content_id)
            payload = self._payload_builder.build(
                request.project_path,
                request.parameters,
                provider_task_id,
                f"/{project.project_path}/videos/",
                tool_context,
            )
        except Exception as error:
            logger.exception(
                "Canvas Design 视频提交请求构造失败: project_path={} element_id={} content_id={} video_id={} error={}",
                request.project_path,
                request.element_id,
                request.content_id,
                provider_task_id,
                error,
            )
            return GenerationSubmission("async", "failed", error_message=str(error))

        logger.info(
            "Canvas Design 视频提交请求: endpoint=POST /api/v1/design/generate-video "
            "project_id={} project_path={} element_id={} content_id={} video_id={} "
            "model_id={} file_dir={} task={} input_mode={} reference_counts={} generation={}",
            payload.get("project_id"),
            request.project_path,
            request.element_id,
            request.content_id,
            provider_task_id,
            payload.get("model_id"),
            payload.get("file_dir"),
            payload.get("task"),
            payload.get("input_mode"),
            self._reference_counts(payload),
            payload.get("generation") or {},
        )
        try:
            response = await self._client.generate_design_video(payload)
        except Exception as error:
            logger.exception(
                "Canvas Design 视频提交请求异常: project_path={} content_id={} video_id={} error={}",
                request.project_path,
                request.content_id,
                provider_task_id,
                error,
            )
            return GenerationSubmission("async", "failed", error_message=str(error))
        returned_id = str(response.get("video_id") or response.get("id") or provider_task_id).strip()
        status = self._status(response) or "processing"
        logger.info(
            "Canvas Design 视频提交响应: project_path={} content_id={} requested_video_id={} "
            "provider_video_id={} status={} response_keys={}",
            request.project_path,
            request.content_id,
            provider_task_id,
            returned_id,
            status,
            sorted(response.keys()),
        )
        if status in {"failed", "error", "canceled", "cancelled"}:
            logger.warning(
                "Canvas Design 视频提交失败: project_path={} content_id={} provider_video_id={} status={} error={}",
                request.project_path,
                request.content_id,
                returned_id,
                status,
                self._error_message(response),
            )
            return GenerationSubmission("async", "failed", error_message=self._error_message(response))
        generation_task_id = f"canvas-generation-{uuid.uuid4().hex}"
        logger.info(
            "Canvas Design 视频任务已提交: project_path={} content_id={} generation_task_id={} provider_video_id={} output_filename={}",
            request.project_path,
            request.content_id,
            generation_task_id,
            returned_id,
            output_filename,
        )
        return GenerationSubmission(
            "async",
            "processing",
            generation_task_id=generation_task_id,
            provider_task_id=returned_id,
            request_metadata={"outputFilename": output_filename},
        )

    async def query(self, request: GenerationQueryRequest, tool_context: ToolContext | None) -> GenerationQueryResult:
        """查询 Design 视频状态，完成后下载到 Canvas 项目目录。"""
        try:
            project_id = self._payload_builder.resolve_project_id(tool_context)
        except Exception as error:
            logger.exception(
                "Canvas Design 视频查询请求构造失败: project_path={} content_id={} provider_video_id={} error={}",
                request.project_path,
                request.content_id,
                request.provider_task_id,
                error,
            )
            return GenerationQueryResult("failed", error_message=str(error))
        logger.info(
            "Canvas Design 视频查询请求: endpoint=GET /api/v1/design/video-generation-result "
            "project_id={} project_path={} element_id={} content_id={} provider_video_id={}",
            project_id,
            request.project_path,
            request.element_id,
            request.content_id,
            request.provider_task_id,
        )
        try:
            response = await self._client.query_video_generation_result(project_id, request.provider_task_id)
        except Exception as error:
            logger.exception(
                "Canvas Design 视频查询请求异常: project_path={} content_id={} provider_video_id={} error={}",
                request.project_path,
                request.content_id,
                request.provider_task_id,
                error,
            )
            return GenerationQueryResult("failed", error_message=str(error))
        status = self._status(response)
        logger.info(
            "Canvas Design 视频查询响应: project_path={} content_id={} provider_video_id={} status={} "
            "file_url_present={} response_keys={}",
            request.project_path,
            request.content_id,
            request.provider_task_id,
            status or "unknown",
            bool(response.get("file_url")),
            sorted(response.keys()),
        )
        if status in {"failed", "error", "canceled", "cancelled"}:
            logger.warning(
                "Canvas Design 视频远端任务失败: project_path={} content_id={} provider_video_id={} status={} error={}",
                request.project_path,
                request.content_id,
                request.provider_task_id,
                status,
                self._error_message(response),
            )
            return GenerationQueryResult("failed", error_message=self._error_message(response))
        if status != "completed":
            logger.debug(
                "Canvas Design 视频仍在处理中: project_path={} content_id={} provider_video_id={} status={}",
                request.project_path,
                request.content_id,
                request.provider_task_id,
                status or "unknown",
            )
            return GenerationQueryResult("processing")
        file_url = str(response.get("file_url") or "").strip()
        if not file_url:
            logger.error(
                "Canvas Design 视频已完成但缺少 file_url: project_path={} content_id={} provider_video_id={}",
                request.project_path,
                request.content_id,
                request.provider_task_id,
            )
            return GenerationQueryResult("failed", error_message="Design video result has no file_url.")
        project = self._project_identity_resolver.resolve(request.project_path)
        project_root = self._asset_path_resolver.resolve_project_root(request.project_path)
        output_filename = request.output_filename or build_video_filename(
            None,
            request.provider_task_id,
            request.content_id,
        )
        target = project_root / "videos" / output_filename
        logger.info(
            "Canvas Design 视频下载开始: project_path={} content_id={} provider_video_id={} output_filename={} file_url_present=True",
            request.project_path,
            request.content_id,
            request.provider_task_id,
            output_filename,
        )
        try:
            await self._client.download_url_to_path(file_url, target)
            logger.info(
                "Canvas Design 视频下载完成: project_path={} content_id={} provider_video_id={} output_uri={}",
                request.project_path,
                request.content_id,
                request.provider_task_id,
                self._asset_path_resolver.to_project_uri(project.project_path, target),
            )
            return GenerationQueryResult(
                "completed",
                output_uri=self._asset_path_resolver.to_project_uri(project.project_path, target),
            )
        except Exception as error:
            logger.exception(
                "Canvas Design 视频下载失败: project_path={} content_id={} provider_video_id={} target={} error={}",
                request.project_path,
                request.content_id,
                request.provider_task_id,
                target,
                error,
            )
            return GenerationQueryResult("failed", error_message=str(error))

    @staticmethod
    def _reference_counts(payload: dict[str, object]) -> dict[str, int]:
        """返回参考素材数量，避免日志记录具体素材 URI。"""
        inputs = payload.get("inputs")
        if not isinstance(inputs, dict):
            return {"images": 0, "videos": 0, "audios": 0, "frames": 0}
        return {
            "images": len(inputs.get("reference_images") or []) if isinstance(inputs.get("reference_images"), list) else 0,
            "videos": len(inputs.get("reference_videos") or []) if isinstance(inputs.get("reference_videos"), list) else 0,
            "audios": len(inputs.get("reference_audios") or []) if isinstance(inputs.get("reference_audios"), list) else 0,
            "frames": len(inputs.get("frames") or []) if isinstance(inputs.get("frames"), list) else 0,
        }

    @staticmethod
    def _status(response: dict[str, object]) -> str:
        """读取并规范化 Design API 状态。"""
        return str(response.get("status") or "").strip().lower()

    @staticmethod
    def _error_message(response: dict[str, object]) -> str:
        """保留 Design API 返回的真实错误信息。"""
        return str(response.get("error_message") or response.get("error") or response.get("message") or "Video generation failed.")
