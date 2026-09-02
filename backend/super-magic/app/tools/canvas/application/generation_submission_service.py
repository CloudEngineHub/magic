"""Canvas 生成提交与结果持久化用例服务。"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, TypeVar, cast

from agentlang.context.tool_context import ToolContext
from app.tools.canvas.application.commands import GenerationSubmissionCommand
from app.tools.canvas.application.element_sizing_service import CanvasElementSizingService
from app.tools.canvas.application.results import CanvasBatchResult, CanvasResultItem, GeneratedResultItem
from app.tools.canvas.domain.content_fields.generated_media_protocol import generation_request_field
from app.tools.canvas.domain.models import CanvasProject
from app.tools.canvas.generation import (
    CanvasGenerationResultApplier,
    GenerationCapability,
    GenerationCapabilityRegistry,
    GenerationExecutionStrategyInterface,
    GenerationExecutionStrategyRegistry,
    GenerationRequest,
    GenerationSubmission,
    GenerationTask,
    GenerationTaskRepository,
)
from app.tools.canvas.infrastructure.persistence.content_metadata_service import ContentMetadataService
from app.tools.canvas.repository import CanvasUnitOfWork

TGeneratedItem = TypeVar("TGeneratedItem", bound=CanvasResultItem)


@dataclass(frozen=True)
class _GenerationWorkItem:
    """保存一个生成项的不可变执行快照，避免并发阶段共享可变请求状态。"""

    submission_item: GenerationSubmissionCommand
    capability: GenerationCapability
    strategy: GenerationExecutionStrategyInterface
    request: GenerationRequest
    parameter_payload: dict[str, Any]


@dataclass(frozen=True)
class _GenerationWorkResult:
    """保存一个生成项的执行结果和可选媒体尺寸。"""

    work_item: _GenerationWorkItem
    submission: GenerationSubmission
    output_dimensions: tuple[int, int] | None = None


class GenerationSubmissionService:
    """提交生成任务并把同步或异步结果写回 Canvas。"""

    def __init__(
        self,
        unit_of_work: CanvasUnitOfWork,
        generation_capabilities: GenerationCapabilityRegistry,
        generation_tasks: GenerationTaskRepository,
        generation_execution: GenerationExecutionStrategyRegistry,
        generation_result_applier: CanvasGenerationResultApplier,
        element_sizing: CanvasElementSizingService | None = None,
        max_concurrency: int = 4,
    ) -> None:
        """显式绑定生成提交依赖，并初始化 provider 并发上限。"""
        self.unit_of_work = unit_of_work
        self.generation_capabilities = generation_capabilities
        self.generation_tasks = generation_tasks
        self.generation_execution = generation_execution
        self.generation_result_applier = generation_result_applier
        self.element_sizing = element_sizing
        self.max_concurrency = self._normalize_max_concurrency(max_concurrency)
        self._generation_semaphore = asyncio.Semaphore(self.max_concurrency)

    async def submit_generated(
        self,
        project_path: str,
        result: CanvasBatchResult[TGeneratedItem],
        generated: list[GenerationSubmissionCommand],
        tool_context: ToolContext | None,
    ) -> CanvasBatchResult[TGeneratedItem]:
        """并发执行生成策略，再按输入顺序提交结果和持久化状态。"""
        by_content: dict[str, GeneratedResultItem] = {}
        for result_item in result.items:
            generated_item = cast(GeneratedResultItem, result_item)
            if generated_item.content_id is not None:
                by_content[generated_item.content_id] = generated_item
        if not generated:
            return result

        work_items = [self._build_work_item(item, project_path) for item in generated]
        await self._execute_work_items(work_items, project_path, tool_context, by_content)
        return result

    def _build_work_item(
        self,
        submission_item: GenerationSubmissionCommand,
        project_path: str,
    ) -> _GenerationWorkItem:
        """在并发执行前固定 capability、策略、请求和参数快照。"""
        parameters = submission_item.parameters
        capability = self.generation_capabilities.get(submission_item.element_type, parameters.model_id)
        request = GenerationRequest(
            project_path=project_path,
            element_id=submission_item.element_id,
            content_id=submission_item.content_id,
            element_type=submission_item.element_type,
            parameters=parameters,
        )
        return _GenerationWorkItem(
            submission_item=submission_item,
            capability=capability,
            strategy=self.generation_execution.get(capability.execution_mode),
            request=request,
            parameter_payload=parameters.to_dict(),
        )

    async def _execute_work_items(
        self,
        work_items: list[_GenerationWorkItem],
        project_path: str,
        tool_context: ToolContext | None,
        by_content: dict[str, GeneratedResultItem],
    ) -> None:
        """按完成事件消费生成结果，并立即提交已完成项。"""
        tasks = [asyncio.create_task(self._execute_work_item(item, project_path, tool_context)) for item in work_items]
        try:
            for completed_task in asyncio.as_completed(tasks):
                work_result = await completed_task
                await self._commit_generation_result(project_path, by_content, work_result)
        except BaseException:
            for task in tasks:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            raise

    async def _execute_work_item(
        self,
        work_item: _GenerationWorkItem,
        project_path: str,
        tool_context: ToolContext | None,
    ) -> _GenerationWorkResult:
        """执行单个 provider 任务，并只产生不含共享写入的结果。"""
        try:
            async with self._generation_semaphore:
                try:
                    submission = await work_item.strategy.execute(
                        work_item.capability,
                        work_item.request,
                        tool_context,
                    )
                except asyncio.CancelledError:
                    raise
                except Exception as error:
                    return _GenerationWorkResult(
                        work_item,
                        self._failed_generation_submission(work_item.capability.execution_mode, error),
                    )
            output_dimensions = None
            if submission.status == "completed" and self.element_sizing is not None:
                output_dimensions = await self.element_sizing.inspect_generated_media(
                    project_path,
                    work_item.submission_item.element_type,
                    submission.output_uri,
                )
            return _GenerationWorkResult(work_item, submission, output_dimensions)
        except asyncio.CancelledError:
            raise

    async def _commit_generation_result(
        self,
        project_path: str,
        by_content: dict[str, GeneratedResultItem],
        work_result: _GenerationWorkResult,
    ) -> None:
        """按原始顺序更新结果、保存任务绑定并持久化 Canvas 状态。"""
        work_item = work_result.work_item
        submission_item = work_item.submission_item
        submission = work_result.submission
        target = by_content.get(submission_item.content_id)
        if target is not None:
            self._apply_result_item(target, submission)

        task_repository_error = await self._save_generation_task(work_item, submission, project_path)

        def persist(project: CanvasProject, metadata: dict[str, Any]) -> tuple[None, dict[str, Any]]:
            """在同一项目事务中持久化生成结果和内部任务绑定。"""
            self.generation_result_applier.apply(
                project,
                submission_item.element_id,
                submission_item.content_id,
                submission.status,
                submission.output_uri,
                submission.error_message,
            )
            element = project.canvas.get_element(submission_item.element_id)
            if element is not None:
                CanvasElementSizingService.apply(element, work_result.output_dimensions)
            detail = ContentMetadataService.get(metadata, submission_item.element_id, submission_item.content_id)
            public_request = ContentMetadataService.build_public_generation_request(
                {
                    **dict(detail.get("generationParameters") or {}),
                    **work_item.parameter_payload,
                    **dict(submission.request_metadata or {}),
                },
                submission_item.element_type,
            )
            detail_update: dict[str, Any] = {
                **detail,
                "elementId": submission_item.element_id,
                "source": "generated",
                "retryCount": submission_item.retry_count,
                "providerTaskId": submission.provider_task_id,
                "generationTaskId": submission.generation_task_id,
                "generationStatus": submission.status,
                "outputUri": submission.output_uri,
                "outputFilename": self._output_filename(submission),
                "errorMessage": submission.error_message,
            }
            request_field = generation_request_field(submission_item.element_type)
            if request_field:
                if submission_item.element_type == "image":
                    public_request = ContentMetadataService.complete_image_generation_request(
                        public_request,
                        submission.status,
                    )
                detail_update[request_field] = public_request
            if submission_item.element_type == "video":
                detail_update["videoGenerationResultMeta"] = ContentMetadataService.merge_video_result_metadata(
                    detail.get("videoGenerationResultMeta") or {},
                    submission.result_metadata,
                    submission.status,
                )
            if submission_item.retry_idempotency_key:
                detail_update["retryIdempotencyKey"] = submission_item.retry_idempotency_key
                detail_update["retryResult"] = {
                    "item_ref": submission_item.item_ref,
                    "element_id": submission_item.element_id,
                    "content_id": submission_item.content_id,
                    "status": submission.status,
                    "retry_count": submission_item.retry_count,
                    "generation_task_id": submission.generation_task_id,
                    "output_uri": submission.output_uri,
                    "error": submission.error_message,
                    "next_action": (
                        "Call wait_canvas_generation with the returned generation_task_id."
                        if submission.generation_task_id
                        else "Call query_canvas_element_details to verify the retried Content."
                    ),
                }
            ContentMetadataService.set(metadata, submission_item.element_id, submission_item.content_id, detail_update)
            return None, metadata

        try:
            await self.unit_of_work.transaction_with_sidecar(project_path, persist)
        except Exception:
            if not submission.generation_task_id:
                raise
            if target is not None:
                target.persistence_warning = (
                    "The generation task was created, but its Canvas metadata could not be saved. "
                    "Keep the returned generation_task_id and call wait_canvas_generation."
                )
                target.persistence_error = "Canvas metadata persistence is temporarily unavailable."
        if task_repository_error and target is not None:
            target.persistence_warning = task_repository_error

    @staticmethod
    def _apply_result_item(target: GeneratedResultItem, submission: GenerationSubmission) -> None:
        """把统一生成结果投影到工具批量结果项。"""
        target.status = submission.status
        if submission.generation_task_id:
            target.generation_task_id = submission.generation_task_id
        if submission.output_uri:
            target.output_uri = submission.output_uri
        if submission.error_message:
            target.error = submission.error_message

    async def _save_generation_task(
        self,
        work_item: _GenerationWorkItem,
        submission: GenerationSubmission,
        project_path: str,
    ) -> str | None:
        """保存异步任务绑定，并把仓储异常收敛为恢复告警。"""
        submission_item = work_item.submission_item
        if not (submission.execution_mode == "async" and submission.generation_task_id and submission.provider_task_id):
            return None
        try:
            await self.generation_tasks.put(
                GenerationTask(
                    generation_task_id=submission.generation_task_id,
                    provider_task_id=submission.provider_task_id,
                    project_path=project_path,
                    element_id=submission_item.element_id,
                    content_id=submission_item.content_id,
                    element_type=submission_item.element_type,
                    capability_name=work_item.capability.name,
                    retry_count=submission_item.retry_count,
                    status=submission.status,
                    error=submission.error_message,
                    output_uri=submission.output_uri,
                    output_filename=self._output_filename(submission),
                )
            )
        except Exception:
            return "Generation task binding was saved in Canvas metadata and can be recovered on the next wait call."
        return None

    @staticmethod
    def _normalize_max_concurrency(value: int) -> int:
        """将并发配置收敛为正整数，非法值安全回退为串行。"""
        try:
            normalized = int(value)
        except (TypeError, ValueError):
            return 1
        return normalized if normalized > 0 else 1

    @staticmethod
    def _failed_generation_submission(execution_mode: str, error: Exception) -> GenerationSubmission:
        """把端口异常收敛为可持久化的失败结果。"""
        message = str(error).strip() or "Generation failed unexpectedly."
        return GenerationSubmission(execution_mode, "failed", error_message=message[:1000])

    @staticmethod
    def _output_filename(submission: GenerationSubmission) -> str | None:
        """读取异步任务提交时确定的本地输出文件名。"""
        value = (submission.request_metadata or {}).get("outputFilename")
        return value if isinstance(value, str) and value else None
