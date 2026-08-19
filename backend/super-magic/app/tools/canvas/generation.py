"""Canvas 内容生成能力的端口、能力注册和执行策略。

本模块只定义 Canvas 需要的生成边界。具体图片或视频驱动通过端口适配，
Application 不依赖某个 provider，也不把同步或异步判断写死在公开工具中。
"""

from __future__ import annotations

import asyncio
import os
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

from agentlang.context.tool_context import ToolContext
from app.tools.canvas.domain.errors import CanvasDomainError


@dataclass(frozen=True)
class GenerationRequest:
    """提交一次生成所需的最小请求。"""

    project_path: str
    element_id: str
    content_id: str
    element_type: str
    parameters: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class GenerationSubmission:
    """生成提交结果，供 Application 回写主文件或任务仓储。"""

    execution_mode: str
    status: str
    generation_task_id: str | None = None
    output_uri: str | None = None
    error_message: str | None = None
    provider_task_id: str | None = None


@dataclass(frozen=True)
class GenerationQueryResult:
    """生成任务查询结果。"""

    status: str
    output_uri: str | None = None
    error_message: str | None = None


@dataclass(frozen=True)
class GenerationQueryRequest:
    """查询异步任务并保存结果所需的 Canvas 上下文。"""

    provider_task_id: str
    project_path: str
    element_id: str
    content_id: str


class GenerationSubmissionPort(Protocol):
    """向某类媒体生成能力提交任务的端口。"""

    execution_mode: str

    async def submit(
        self, request: GenerationRequest, tool_context: ToolContext | None
    ) -> GenerationSubmission:
        """提交生成任务。"""


class GenerationQueryPort(Protocol):
    """查询异步生成任务的端口。"""

    async def query(
        self, request: GenerationQueryRequest, tool_context: ToolContext | None
    ) -> GenerationQueryResult:
        """查询 provider 任务状态。"""


@dataclass(frozen=True)
class GenerationCapability:
    """描述一种内容类型当前使用的生成能力。"""

    name: str
    element_type: str
    execution_mode: str
    submission_port: GenerationSubmissionPort
    query_port: GenerationQueryPort | None = None


class GenerationCapabilityRegistry:
    """按 Element 类型注册和查找生成能力。"""

    def __init__(self, capabilities: list[GenerationCapability] | None = None, workspace: Path | None = None):
        """初始化能力注册表；未传入时加载默认图片和视频适配。"""
        values = capabilities if capabilities is not None else default_generation_capabilities(workspace)
        self._capabilities = {capability.element_type: capability for capability in values}

    def get(self, element_type: str) -> GenerationCapability:
        """获取指定 Element 类型的生成能力。"""
        capability = self._capabilities.get(element_type)
        if capability is None:
            raise CanvasDomainError(
                "GENERATION_NOT_CONFIGURED",
                f"No generation capability is configured for {element_type}.",
            )
        return capability


@dataclass
class GenerationTask:
    """Canvas 任务与 provider 任务的内部绑定。"""

    generation_task_id: str
    provider_task_id: str
    project_path: str
    element_id: str
    content_id: str
    element_type: str
    capability_name: str
    status: str = "processing"
    error: str | None = None
    output_uri: str | None = None


class GenerationTaskRepository(Protocol):
    """异步生成任务绑定仓储。"""

    async def put(self, task: GenerationTask) -> None:
        """保存任务绑定。"""

    async def get(self, generation_task_id: str) -> GenerationTask | None:
        """读取任务绑定。"""

    async def update(self, task: GenerationTask) -> None:
        """更新任务状态。"""


class InMemoryGenerationTaskRepository:
    """进程内任务仓储；生产环境可替换为持久化实现。"""

    def __init__(self) -> None:
        """初始化任务字典和并发锁。"""
        self._records: dict[str, GenerationTask] = {}
        self._lock = asyncio.Lock()

    async def put(self, task: GenerationTask) -> None:
        """保存任务绑定。"""
        async with self._lock:
            self._records[task.generation_task_id] = task

    async def get(self, generation_task_id: str) -> GenerationTask | None:
        """读取任务绑定。"""
        async with self._lock:
            return self._records.get(generation_task_id)

    async def update(self, task: GenerationTask) -> None:
        """更新任务状态。"""
        async with self._lock:
            self._records[task.generation_task_id] = task


class SynchronousGenerationStrategy:
    """执行同步生成并直接返回结果 URI。"""

    async def execute(
        self,
        capability: GenerationCapability,
        request: GenerationRequest,
        tool_context: ToolContext | None,
    ) -> GenerationSubmission:
        """调用同步端口。"""
        if capability.execution_mode != "sync":
            raise CanvasDomainError("GENERATION_EXECUTION_MODE_INVALID", "Capability is not synchronous.")
        submission = await capability.submission_port.submit(request, tool_context)
        if submission.execution_mode != "sync" or submission.status not in {"completed", "failed"}:
            raise CanvasDomainError("GENERATION_RESULT_INVALID", "Synchronous generation returned an invalid result.")
        if submission.status == "completed" and not submission.output_uri:
            raise CanvasDomainError("GENERATION_RESULT_INVALID", "Synchronous generation returned no output URI.")
        return submission


class AsynchronousGenerationStrategy:
    """提交异步生成并返回 Canvas 任务 ID。"""

    async def execute(
        self,
        capability: GenerationCapability,
        request: GenerationRequest,
        tool_context: ToolContext | None,
    ) -> GenerationSubmission:
        """调用异步端口并校验任务标识。"""
        if capability.execution_mode != "async":
            raise CanvasDomainError("GENERATION_EXECUTION_MODE_INVALID", "Capability is not asynchronous.")
        submission = await capability.submission_port.submit(request, tool_context)
        if submission.execution_mode != "async":
            raise CanvasDomainError("GENERATION_RESULT_INVALID", "Asynchronous generation returned an invalid mode.")
        if submission.status not in {"processing", "pending", "completed", "failed"}:
            raise CanvasDomainError("GENERATION_RESULT_INVALID", "Generation returned an unsupported status.")
        if submission.status in {"processing", "pending"} and not submission.provider_task_id:
            raise CanvasDomainError("GENERATION_TASK_ID_MISSING", "Asynchronous generation did not return a task ID.")
        return submission


class GenericImageGenerationPort:
    """适配现有通用生图能力的同步端口。"""

    execution_mode = "sync"

    def __init__(self, workspace: Path):
        """保存工作区根目录。"""
        self.workspace = workspace

    async def submit(
        self, request: GenerationRequest, tool_context: ToolContext | None
    ) -> GenerationSubmission:
        """调用通用生图工具并返回工作区相对结果路径。"""
        from app.tools.generate_images import GenerateImages, GenerateImagesParams, ImageGenerationTask

        parameters = request.parameters
        name = str(parameters.get("name") or request.content_id)
        output_path = str(parameters.get("output_path") or f"{request.project_path}/images")
        task = ImageGenerationTask(
            prompt=str(parameters.get("prompt") or ""),
            size=parameters.get("size"),
            name=name,
            output_path=output_path,
            reference_images=list(parameters.get("reference_images") or []),
        )
        result = await GenerateImages(base_dir=self.workspace).execute_purely(
            tool_context,
            GenerateImagesParams(tasks=[task]),
            model_id=parameters.get("model_id"),
        )
        if not result.ok:
            return GenerationSubmission("sync", "failed", error_message=result.content)
        saved = list(result.extra_info.get("saved_images") or []) if result.extra_info else []
        if not saved:
            return GenerationSubmission("sync", "failed", error_message="Image generation returned no output.")
        output = Path(saved[0])
        try:
            output_uri = output.relative_to(self.workspace).as_posix()
        except ValueError:
            output_uri = str(saved[0])
        return GenerationSubmission("sync", "completed", output_uri=output_uri)


class GenericVideoGenerationPort:
    """适配现有通用视频能力的异步提交和查询端口。"""

    execution_mode = "async"

    def __init__(self, workspace: Path):
        """保存工作区根目录。"""
        self.workspace = workspace

    async def submit(
        self, request: GenerationRequest, tool_context: ToolContext | None
    ) -> GenerationSubmission:
        """提交视频任务，不在提交阶段阻塞等待结果。"""
        from app.tools.generate_video import GenerateVideo, GenerateVideoParams

        parameters = request.parameters
        params = GenerateVideoParams(
            action="generate",
            prompt=str(parameters.get("prompt") or ""),
            model_id=str(parameters.get("model_id") or ""),
            video_name=str(parameters.get("name") or request.content_id),
            output_path=str(parameters.get("output_path") or f"{request.project_path}/videos"),
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
            extensions=dict(parameters.get("extensions") or {}),
        )
        result = await GenerateVideo(base_dir=self.workspace).execute_purely(tool_context, params)
        operation_id = str((result.data or {}).get("operation_id") or "").strip()
        if not result.ok or not operation_id:
            return GenerationSubmission("async", "failed", error_message=result.content)
        task_id = f"canvas-generation-{uuid.uuid4().hex}"
        return GenerationSubmission("async", "processing", generation_task_id=task_id, provider_task_id=operation_id)

    async def query(
        self, request: GenerationQueryRequest, tool_context: ToolContext | None
    ) -> GenerationQueryResult:
        """查询视频任务一次并在成功时下载到项目目录。"""
        from app.tools.get_video import GetVideo, GetVideoParams

        result = await GetVideo(base_dir=self.workspace).execute_purely(
            tool_context,
            GetVideoParams(
                operation_id=request.provider_task_id,
                wait_mode="once",
                video_name=request.content_id,
                output_path=f"{request.project_path}/videos",
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


_FAKE_VIDEO_QUERIES: dict[str, int] = {}
_FAKE_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\x0dIDAT"
    b"\x08\xd7c\xf8\xcf\xc0\xf0\x1f\x00\x05\x00\x01\xff\x89\x99=\x1d\x00\x00\x00\x00IEND\xaeB`\x82"
)


class FakeImageGenerationPort:
    """本地调试用同步生图端口，不访问真实模型或外部服务。"""

    execution_mode = "sync"

    def __init__(self, workspace: Path):
        """保存工作区根目录。"""
        self.workspace = workspace

    async def submit(
        self, request: GenerationRequest, tool_context: ToolContext | None
    ) -> GenerationSubmission:
        """写入最小合法 PNG 并同步返回。"""
        output = self.workspace / request.project_path / "images" / f"{request.content_id}.png"
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(_FAKE_PNG)
        return GenerationSubmission(
            "sync",
            "completed",
            output_uri=output.relative_to(self.workspace).as_posix(),
        )


class FakeVideoGenerationPort:
    """本地调试用异步生视频端口，第一次查询处理中，第二次查询完成。"""

    execution_mode = "async"

    def __init__(self, workspace: Path):
        """保存工作区根目录。"""
        self.workspace = workspace

    async def submit(
        self, request: GenerationRequest, tool_context: ToolContext | None
    ) -> GenerationSubmission:
        """创建进程内 fake provider 任务，不生成真实视频。"""
        provider_task_id = f"fake-provider-{uuid.uuid4().hex}"
        _FAKE_VIDEO_QUERIES[provider_task_id] = 0
        return GenerationSubmission(
            "async",
            "processing",
            generation_task_id=f"canvas-generation-{uuid.uuid4().hex}",
            provider_task_id=provider_task_id,
        )

    async def query(
        self, request: GenerationQueryRequest, tool_context: ToolContext | None
    ) -> GenerationQueryResult:
        """按固定两阶段返回 fake 状态，并写入最小视频占位文件。"""
        count = _FAKE_VIDEO_QUERIES.get(request.provider_task_id, 0) + 1
        _FAKE_VIDEO_QUERIES[request.provider_task_id] = count
        if count == 1:
            return GenerationQueryResult("processing")
        output = self.workspace / request.project_path / "videos" / f"{request.content_id}.mp4"
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(b"fake-canvas-video")
        return GenerationQueryResult(
            "completed",
            output_uri=output.relative_to(self.workspace).as_posix(),
        )


def default_generation_capabilities(workspace: Path | None = None) -> list[GenerationCapability]:
    """创建默认图片同步和视频异步能力。"""
    workspace = workspace or Path.cwd()
    if os.getenv("CANVAS_FAKE_GENERATION") == "1":
        image = FakeImageGenerationPort(workspace)
        video = FakeVideoGenerationPort(workspace)
        return [
            GenerationCapability("fake-image-generation", "image", "sync", image, None),
            GenerationCapability("fake-video-generation", "video", "async", video, video),
        ]
    image = GenericImageGenerationPort(workspace)
    video = GenericVideoGenerationPort(workspace)
    return [
        GenerationCapability("image-generation", "image", "sync", image, None),
        GenerationCapability("video-generation", "video", "async", video, video),
    ]
