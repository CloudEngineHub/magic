"""本地开发环境的视频生成结果后台同步服务。"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from agentlang.logger import get_logger

from app.infrastructure.magic_service.client import MagicServiceClient
from app.tools.design.domain.services.content_service import ContentService
from app.tools.design.manager.canvas_manager_factory import get_canvas_manager

logger = get_logger(__name__)

_POLL_INTERVAL_SECONDS = 2
_POLL_TIMEOUT_SECONDS = 900
_running_tasks: dict[str, asyncio.Task[None]] = {}


@dataclass(frozen=True)
class LocalVideoResultSyncRequest:
    """描述一个已提交视频任务的本地同步目标。"""

    project_path: Path
    project_id: str
    video_id: str
    element_id: str
    content_id: str
    output_path: Path
    relative_output_path: str
    width: int
    height: int
    set_as_main: bool


class LocalVideoResultSyncService:
    """在后台轮询远端视频结果，下载文件并回写确定的 Canvas Content。"""

    @classmethod
    def schedule(cls, request: LocalVideoResultSyncRequest) -> None:
        """调度一个不阻塞工具返回的本地结果同步任务。"""
        task_key = cls._task_key(request)
        existing_task = _running_tasks.get(task_key)
        if existing_task is not None and not existing_task.done():
            return

        task = asyncio.create_task(
            cls._run(request),
            name=f"local-video-result-sync-{request.video_id}",
        )
        _running_tasks[task_key] = task

        def handle_done(done_task: asyncio.Task[None]) -> None:
            """清理任务引用并消费后台异常。"""
            if _running_tasks.get(task_key) is done_task:
                _running_tasks.pop(task_key, None)
            try:
                done_task.result()
            except asyncio.CancelledError:
                logger.info("本地视频结果同步任务已取消: video_id=%s", request.video_id)
            except Exception:
                logger.exception("本地视频结果同步任务异常: video_id=%s", request.video_id)

        task.add_done_callback(handle_done)

    @classmethod
    async def _run(cls, request: LocalVideoResultSyncRequest) -> None:
        """轮询远端状态，完成后下载并更新 Canvas Content。"""
        try:
            async with MagicServiceClient() as client:
                result = await cls._wait_for_result(client, request)
                file_url = str(result.get("file_url") or "")
                if not file_url:
                    raise ValueError(
                        f"Completed video result has no file_url: {request.video_id}"
                    )
                await client.download_url_to_path(file_url, request.output_path)
            await cls._mark_completed(request)
        except asyncio.CancelledError:
            raise
        except Exception as error:
            try:
                await cls._mark_failed(request, str(error))
            except Exception:
                logger.exception(
                    "本地视频结果同步失败状态回写异常: video_id=%s",
                    request.video_id,
                )
            raise

    @staticmethod
    async def _wait_for_result(
        client: MagicServiceClient,
        request: LocalVideoResultSyncRequest,
    ) -> dict[str, Any]:
        """等待 Magic Service 返回最终视频状态。"""
        deadline = time.monotonic() + _POLL_TIMEOUT_SECONDS
        while True:
            result = await client.query_video_generation_result(
                request.project_id,
                request.video_id,
            )
            status = str(result.get("status") or "").casefold()
            if status == "completed":
                return result
            if status in {"failed", "error", "cancelled", "canceled"}:
                raise ValueError(
                    str(result.get("error_message") or "Video generation failed")
                )
            if time.monotonic() >= deadline:
                raise TimeoutError(
                    f"Timed out waiting for video generation result: {request.video_id}"
                )
            await asyncio.sleep(_POLL_INTERVAL_SECONDS)

    @staticmethod
    async def _mark_completed(request: LocalVideoResultSyncRequest) -> None:
        """把已下载结果写回提交时的确定 Content。"""
        manager = await get_canvas_manager(str(request.project_path))

        async def complete(config: Any) -> None:
            """在画布写事务内完成视频 Content 更新。"""
            element = await manager.get_element_by_id(request.element_id, config=config)
            if element is None:
                raise ValueError(f"Video Element does not exist: {request.element_id}")
            content_id = request.content_id if manager.supports_content_versions() else None
            updated = await manager.update_element(
                request.element_id,
                {
                    "status": "completed",
                    "src": request.relative_output_path,
                    "width": float(request.width),
                    "height": float(request.height),
                    "errorMessage": None,
                },
                config=config,
                content_id=content_id,
            )
            if not updated:
                raise ValueError(f"Video Element does not exist: {request.element_id}")
            if request.set_as_main and manager.supports_content_versions():
                ContentService.set_main_content(element, request.content_id)

        await manager.run_write_transaction(complete)

    @staticmethod
    async def _mark_failed(request: LocalVideoResultSyncRequest, error_message: str) -> None:
        """把远端失败或下载失败状态写回提交时的确定 Content。"""
        manager = await get_canvas_manager(str(request.project_path))

        async def fail(config: Any) -> None:
            """在画布写事务内写回失败状态。"""
            element = await manager.get_element_by_id(request.element_id, config=config)
            if element is None:
                return
            content_id = request.content_id if manager.supports_content_versions() else None
            await manager.update_element(
                request.element_id,
                {
                    "status": "failed",
                    "errorMessage": error_message[:300],
                },
                config=config,
                content_id=content_id,
            )

        await manager.run_write_transaction(fail)

    @staticmethod
    def _task_key(request: LocalVideoResultSyncRequest) -> str:
        """生成进程内后台同步任务的唯一键。"""
        return f"{request.project_path}:{request.element_id}:{request.content_id}:{request.video_id}"
