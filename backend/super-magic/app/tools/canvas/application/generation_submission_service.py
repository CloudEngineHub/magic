"""Canvas 生成提交与结果持久化用例服务。"""

from __future__ import annotations

from typing import Any, TypeVar, cast

from agentlang.context.tool_context import ToolContext
from app.tools.canvas.application.commands import GenerationSubmissionCommand
from app.tools.canvas.application.element_sizing_service import CanvasElementSizingService
from app.tools.canvas.application.results import CanvasBatchResult, CanvasResultItem, GeneratedResultItem
from app.tools.canvas.domain.models import CanvasProject
from app.tools.canvas.generation import (
    CanvasGenerationResultApplier,
    GenerationCapabilityRegistry,
    GenerationExecutionStrategyRegistry,
    GenerationRequest,
    GenerationSubmission,
    GenerationTask,
    GenerationTaskRepository,
)
from app.tools.canvas.infrastructure.persistence.content_metadata_service import ContentMetadataService
from app.tools.canvas.repository import CanvasUnitOfWork

TGeneratedItem = TypeVar("TGeneratedItem", bound=CanvasResultItem)


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
    ) -> None:
        """显式绑定生成提交所需的事务、能力、执行、任务和结果端口。"""
        self.unit_of_work = unit_of_work
        self.generation_capabilities = generation_capabilities
        self.generation_tasks = generation_tasks
        self.generation_execution = generation_execution
        self.generation_result_applier = generation_result_applier
        self.element_sizing = element_sizing

    async def submit_generated(
        self,
        project_path: str,
        result: CanvasBatchResult[TGeneratedItem],
        generated: list[GenerationSubmissionCommand],
        tool_context: ToolContext | None,
    ) -> CanvasBatchResult[TGeneratedItem]:
        """提交生成能力并把逐项状态合并回结构结果。"""
        by_content: dict[str, GeneratedResultItem] = {}
        for result_item in result.items:
            generated_item = cast(GeneratedResultItem, result_item)
            if generated_item.content_id is not None:
                by_content[generated_item.content_id] = generated_item
        for submission_item in generated:
            parameters = submission_item.parameters
            capability = self.generation_capabilities.get(submission_item.element_type, parameters.model_id)
            parameter_payload = parameters.to_dict()
            request = GenerationRequest(
                project_path=project_path,
                element_id=submission_item.element_id,
                content_id=submission_item.content_id,
                element_type=submission_item.element_type,
                parameters=parameters,
            )
            strategy = self.generation_execution.get(capability.execution_mode)
            try:
                submission = await strategy.execute(capability, request, tool_context)
            except Exception as error:
                submission = self._failed_generation_submission(capability.execution_mode, error)

            output_dimensions = None
            if submission.status == "completed" and self.element_sizing is not None:
                output_dimensions = await self.element_sizing.inspect_generated_media(
                    project_path,
                    submission_item.element_type,
                    submission.output_uri,
                )

            target = by_content.get(submission_item.content_id)
            if target is not None:
                generated_target = target
                generated_target.status = submission.status
                if submission.generation_task_id:
                    generated_target.generation_task_id = submission.generation_task_id
                if submission.output_uri:
                    generated_target.output_uri = submission.output_uri
                if submission.error_message:
                    generated_target.error = submission.error_message

            task_repository_error: str | None = None
            if submission.execution_mode == "async" and submission.generation_task_id and submission.provider_task_id:
                try:
                    await self.generation_tasks.put(
                        GenerationTask(
                            generation_task_id=submission.generation_task_id,
                            provider_task_id=submission.provider_task_id,
                            project_path=project_path,
                            element_id=submission_item.element_id,
                            content_id=submission_item.content_id,
                            element_type=submission_item.element_type,
                            capability_name=capability.name,
                            retry_count=submission_item.retry_count,
                            status=submission.status,
                            error=submission.error_message,
                            output_uri=submission.output_uri,
                            output_filename=self._output_filename(submission),
                        )
                    )
                except Exception:
                    task_repository_error = (
                        "Generation task binding was saved in Canvas metadata and can be recovered on the next wait call."
                    )

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
                    CanvasElementSizingService.apply(element, output_dimensions)
                detail = ContentMetadataService.get(metadata, submission_item.element_id, submission_item.content_id)
                public_request = ContentMetadataService.build_public_generation_request(
                    {
                        **parameter_payload,
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
                if submission.status == "completed":
                    if submission_item.element_type == "image":
                        detail_update["generateImageRequest"] = public_request
                    elif submission_item.element_type == "video":
                        detail_update["generateVideoRequest"] = public_request
                else:
                    ContentMetadataService.clear_public_request(
                        metadata,
                        submission_item.element_id,
                        submission_item.content_id,
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
                    generated_target = cast(GeneratedResultItem, target)
                    generated_target.status = submission.status
                    generated_target.persistence_warning = (
                        "The generation task was created, but its Canvas metadata could not be saved. "
                        "Keep the returned generation_task_id and call wait_canvas_generation."
                    )
                    generated_target.persistence_error = "Canvas metadata persistence is temporarily unavailable."
            if task_repository_error and target is not None:
                cast(GeneratedResultItem, target).persistence_warning = task_repository_error
        return result

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
