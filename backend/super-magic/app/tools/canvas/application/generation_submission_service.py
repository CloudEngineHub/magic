"""Canvas 生成提交与结果持久化用例服务。"""

from __future__ import annotations

from typing import Any

from agentlang.context.tool_context import ToolContext

from app.tools.canvas.application.commands import GenerationSubmissionCommand
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


class GenerationSubmissionService:
    """提交生成任务并把同步或异步结果写回 Canvas。"""

    def __init__(
        self,
        unit_of_work: CanvasUnitOfWork,
        generation_capabilities: GenerationCapabilityRegistry,
        generation_tasks: GenerationTaskRepository,
        generation_execution: GenerationExecutionStrategyRegistry,
        generation_result_applier: CanvasGenerationResultApplier,
    ) -> None:
        """显式绑定生成提交所需的事务、能力、执行、任务和结果端口。"""
        self.unit_of_work = unit_of_work
        self.generation_capabilities = generation_capabilities
        self.generation_tasks = generation_tasks
        self.generation_execution = generation_execution
        self.generation_result_applier = generation_result_applier

    async def submit_generated(
        self,
        project_path: str,
        result: dict[str, Any],
        generated: list[GenerationSubmissionCommand],
        tool_context: ToolContext | None,
    ) -> dict[str, Any]:
        """提交生成能力并把逐项状态合并回结构结果。"""
        by_content = {
            item["content_id"]: item
            for item in result.get("items", [])
            if item.get("content_id")
        }
        for item in generated:
            parameters = item.parameters
            parameter_payload = parameters.to_dict()
            capability = self.generation_capabilities.get(item.element_type, parameters.model_id)
            request = GenerationRequest(
                project_path=project_path,
                element_id=item.element_id,
                content_id=item.content_id,
                element_type=item.element_type,
                parameters=parameters,
            )
            strategy = self.generation_execution.get(capability.execution_mode)
            try:
                submission = await strategy.execute(capability, request, tool_context)
            except Exception as error:
                submission = self._failed_generation_submission(capability.execution_mode, error)

            target = by_content.get(item.content_id)
            if target is not None:
                target["status"] = submission.status
                if submission.generation_task_id:
                    target["generation_task_id"] = submission.generation_task_id
                if submission.output_uri:
                    target["output_uri"] = submission.output_uri
                if submission.error_message:
                    target["error"] = submission.error_message

            task_repository_error: str | None = None
            if submission.execution_mode == "async" and submission.generation_task_id and submission.provider_task_id:
                try:
                    await self.generation_tasks.put(
                        GenerationTask(
                            generation_task_id=submission.generation_task_id,
                            provider_task_id=submission.provider_task_id,
                            project_path=project_path,
                            element_id=item.element_id,
                            content_id=item.content_id,
                            element_type=item.element_type,
                            capability_name=capability.name,
                            retry_count=item.retry_count,
                            status=submission.status,
                            error=submission.error_message,
                            output_uri=submission.output_uri,
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
                    item.element_id,
                    item.content_id,
                    submission.status,
                    submission.output_uri,
                    submission.error_message,
                )
                detail = ContentMetadataService.get(metadata, item.element_id, item.content_id)
                detail_update = {
                    **detail,
                    "elementId": item.element_id,
                    "source": "generated",
                    "retryCount": item.retry_count,
                    "generationParameters": parameter_payload,
                    "providerTaskId": submission.provider_task_id,
                    "generationTaskId": submission.generation_task_id,
                    "generationStatus": submission.status,
                    "outputUri": submission.output_uri,
                    "errorMessage": submission.error_message,
                }
                if item.retry_idempotency_key:
                    detail_update["retryIdempotencyKey"] = item.retry_idempotency_key
                    detail_update["retryResult"] = {
                        "item_ref": item.item_ref,
                        "element_id": item.element_id,
                        "content_id": item.content_id,
                        "status": submission.status,
                        "retry_count": item.retry_count,
                        "generation_task_id": submission.generation_task_id,
                        "output_uri": submission.output_uri,
                        "error": submission.error_message,
                        "next_action": (
                            "Call wait_canvas_generation with the returned generation_task_id."
                            if submission.generation_task_id
                            else "Call query_canvas_element_details to verify the retried Content."
                        ),
                    }
                ContentMetadataService.set(metadata, item.element_id, item.content_id, detail_update)
                return None, metadata

            try:
                await self.unit_of_work.transaction_with_sidecar(project_path, persist)
            except Exception:
                if not submission.generation_task_id:
                    raise
                if target is not None:
                    target["status"] = submission.status
                    target["persistence_warning"] = (
                        "The generation task was created, but its Canvas metadata could not be saved. "
                        "Keep the returned generation_task_id and call wait_canvas_generation."
                    )
                    target["persistence_error"] = "Canvas metadata persistence is temporarily unavailable."
            if task_repository_error and target is not None:
                target["persistence_warning"] = task_repository_error
        return result

    @staticmethod
    def _failed_generation_submission(execution_mode: str, error: Exception) -> GenerationSubmission:
        """把端口异常收敛为可持久化的失败结果。"""
        message = str(error).strip() or "Generation failed unexpectedly."
        return GenerationSubmission(execution_mode, "failed", error_message=message[:1000])
