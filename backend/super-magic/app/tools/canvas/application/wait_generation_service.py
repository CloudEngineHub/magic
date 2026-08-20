"""异步生成等待用例服务。"""

from __future__ import annotations

import asyncio
import time
from typing import Any

from agentlang.context.tool_context import ToolContext

from app.tools.canvas.application.support import CanvasApplicationOperations
from app.tools.canvas.generation import CanvasGenerationResultApplier, GenerationCapabilityRegistry, GenerationTaskPoller, GenerationTaskRepository
from app.tools.canvas.infrastructure.persistence.canvas_repository_interface import CanvasRepositoryInterface
from app.tools.canvas.repository import CanvasUnitOfWork
from app.tools.canvas.domain.errors import CanvasDomainError
from app.tools.canvas.domain.models import CanvasProject
from app.tools.canvas.generation import GenerationQueryRequest, GenerationTask
from app.tools.core.tool_keepalive import start_tool_keep_alive, stop_tool_keep_alive


class WaitGenerationService:
    """Canvas WaitGenerationService 用例服务。"""

    def __init__(self, repository: CanvasRepositoryInterface, unit_of_work: CanvasUnitOfWork, generation_capabilities: GenerationCapabilityRegistry, generation_tasks: GenerationTaskRepository, generation_poller: GenerationTaskPoller, generation_result_applier: CanvasGenerationResultApplier):
        """显式绑定等待用例所需的仓储、事务、能力、任务和结果端口。"""
        self.repository = repository
        self.unit_of_work = unit_of_work
        self.generation_capabilities = generation_capabilities
        self.generation_result_applier = generation_result_applier
        self.generation_tasks = generation_tasks
        self.generation_poller = generation_poller

    async def wait(
        self,
        project_path: str,
        task_ids: list[str],
        max_wait_seconds: int = 60,
        tool_context: ToolContext | None = None,
    ) -> dict[str, Any]:
        """轮询异步任务并在终态回写 Content。"""
        if len(task_ids) != len(set(task_ids)):
            raise CanvasDomainError("GENERATION_TASK_ID_INVALID", "generation_task_id values must be unique within a wait call.")
        keep_alive_task = start_tool_keep_alive(tool_context) if tool_context is not None else None
        try:
            deadline = time.monotonic() + max_wait_seconds
            results = await asyncio.gather(
                *(self._wait_one_safely(project_path, task_id, deadline, tool_context) for task_id in task_ids)
            )
            return {"items": results}
        finally:
            stop_tool_keep_alive(keep_alive_task)

    async def _wait_one_safely(
        self,
        project_path: str,
        task_id: str,
        deadline: float,
        tool_context: ToolContext | None,
    ) -> dict[str, Any]:
        """隔离单个等待任务的查询或持久化异常，避免拖垮同批其他任务。"""
        try:
            return await self._wait_one(project_path, task_id, deadline, tool_context)
        except CanvasDomainError as error:
            if error.code in {"CONTENT_NOT_FOUND", "ELEMENT_NOT_FOUND"}:
                return {
                    "generation_task_id": task_id,
                    "status": "not_found",
                    "error": error.message,
                }
            return {
                "generation_task_id": task_id,
                "status": "processing",
                "query_error": "Generation status is temporarily unavailable.",
                "next_action": "Call wait_canvas_generation again with the same generation_task_id.",
            }
        except Exception:
            return {
                "generation_task_id": task_id,
                "status": "processing",
                "query_error": "Generation status is temporarily unavailable.",
                "next_action": "Call wait_canvas_generation again with the same generation_task_id.",
            }

    async def _wait_one(
        self,
        project_path: str,
        task_id: str,
        deadline: float,
        tool_context: ToolContext | None,
    ) -> dict[str, Any]:
        """在共享等待窗口内查询并幂等回写一个异步任务。"""
        record = await self.generation_tasks.get(task_id)
        if record is None:
            record = await self._recover_generation_task(project_path, task_id)
        if record is None or record.project_path != project_path:
            return {
                "generation_task_id": task_id,
                "status": "not_found",
            }
        if record.status in {"completed", "failed"}:
            return {
                "generation_task_id": task_id,
                "element_id": record.element_id,
                "content_id": record.content_id,
                "status": record.status,
                "output_uri": record.output_uri,
                "error": record.error,
                "already_finalized": True,
            }
        if record.element_type in {"frame", "group"}:
            return {
                "generation_task_id": task_id,
                "element_id": record.element_id,
                "content_id": record.content_id,
                "status": "not_applicable",
                "error_code": "FRAME_GENERATION_NOT_APPLICABLE",
                "error": "Frame and Group Elements do not have generation tasks.",
                "next_action": "Do not wait for this Element; use Canvas layout or query tools instead.",
            }
        capability = self.generation_capabilities.get_by_name(
            record.capability_name,
            record.element_type,
        )
        if capability.query_port is None:
            return {"generation_task_id": task_id, "status": "processing", "timed_out": True}
        query_result = await self.generation_poller.poll(
            capability.query_port,
            GenerationQueryRequest(
                provider_task_id=record.provider_task_id,
                project_path=record.project_path,
                element_id=record.element_id,
                content_id=record.content_id,
            ),
            deadline,
            tool_context,
        )
        if query_result.status not in {"completed", "failed"}:
            return {
                "generation_task_id": task_id,
                "element_id": record.element_id,
                "content_id": record.content_id,
                "status": query_result.status,
                "timed_out": True,
                "next_action": "Call wait_canvas_generation again with the same generation_task_id.",
            }

        final_status = query_result.status

        def finalize(project: CanvasProject, metadata: dict) -> tuple[None, dict]:
            """在同一项目事务中完成异步结果和任务元数据回写。"""
            self.generation_result_applier.apply(
                project,
                record.element_id,
                record.content_id,
                final_status,
                query_result.output_uri,
                query_result.error_message,
            )
            detail = CanvasApplicationOperations.get_content_detail(metadata, record.element_id, record.content_id)
            CanvasApplicationOperations.set_content_detail(metadata, record.element_id, record.content_id, {
                **detail,
                "generationStatus": final_status,
                "outputUri": query_result.output_uri,
                "errorMessage": query_result.error_message,
            })
            return None, metadata

        await self.unit_of_work.transaction_with_sidecar(project_path, finalize)
        record.status = final_status
        record.error = query_result.error_message
        record.output_uri = query_result.output_uri
        await self.generation_tasks.update(record)
        return {
            "generation_task_id": task_id,
            "element_id": record.element_id,
            "content_id": record.content_id,
            "status": final_status,
            "output_uri": query_result.output_uri,
            "error": query_result.error_message,
            "next_action": "Call query_canvas_element_details to verify the persisted Content.",
        }

    async def _recover_generation_task(
        self, project_path: str, generation_task_id: str
    ) -> GenerationTask | None:
        """从 sidecar 恢复进程重启后仍未完成的异步任务绑定。"""
        metadata = await self.repository.read_sidecar(project_path)
        project = await self.repository.read(project_path)
        for element in project.canvas.iter_elements():
            for content in element.contents:
                detail = CanvasApplicationOperations.get_content_detail(metadata, element.element_id, content.content_id)
                if detail.get("generationTaskId") != generation_task_id:
                    continue
                provider_task_id = detail.get("providerTaskId")
                if not isinstance(provider_task_id, str) or not provider_task_id:
                    return None
                parameters = detail.get("generationParameters") or {}
                try:
                    capability_name = self.generation_capabilities.get(
                        element.element_type,
                        parameters.get("model_id"),
                    ).name
                except CanvasDomainError:
                    capability_name = "recovered"
                record = GenerationTask(
                    generation_task_id=generation_task_id,
                    provider_task_id=provider_task_id,
                    project_path=project_path,
                    element_id=element.element_id,
                    content_id=content.content_id,
                    element_type=element.element_type,
                    capability_name=capability_name,
                    retry_count=int(detail.get("retryCount", 0)),
                    status=str(detail.get("generationStatus") or content.fields.generation_status or "processing"),
                    error=detail.get("errorMessage") or content.fields.error_message,
                    output_uri=detail.get("outputUri") or content.fields.asset_path,
                )
                await self.generation_tasks.put(record)
                return record
        return None
