"""失败 Content 重试用例服务。"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from agentlang.context.tool_context import ToolContext
from app.tools.canvas.application.commands import GenerationParameters, GenerationSubmissionCommand, RetryContentCommand
from app.tools.canvas.application.support import CanvasApplicationOperations
from app.tools.canvas.domain.content_fields.generated_media import GeneratedMediaContentFields
from app.tools.canvas.domain.errors import CanvasDomainError
from app.tools.canvas.domain.models import CanvasProject
from app.tools.canvas.generation import GenerationCapabilityRegistry
from app.tools.canvas.infrastructure.persistence.canvas_repository_interface import CanvasRepositoryInterface
from app.tools.canvas.infrastructure.persistence.content_metadata_service import ContentMetadataService
from app.tools.canvas.production.services.generation_estimate_guard import GenerationEstimateGuard
from app.tools.canvas.repository import CanvasUnitOfWork


class RetryContentService:
    """Canvas RetryContentService 用例服务。"""

    def __init__(self, repository: CanvasRepositoryInterface, unit_of_work: CanvasUnitOfWork, generation_capabilities: GenerationCapabilityRegistry, generation_submission_service, estimate_guard: GenerationEstimateGuard):
        """显式绑定重试用例所需的仓储、事务、生成能力和提交服务。"""
        self.repository = repository
        self.unit_of_work = unit_of_work
        self.generation_capabilities = generation_capabilities
        self.generation_submission_service = generation_submission_service
        self.estimate_guard = estimate_guard

    async def retry_content(self, project_path: str, items: Sequence[RetryContentCommand], tool_context: ToolContext | None = None) -> dict[str, Any]:
        """校验失败 Content 的受控重试边界，并复用原 Content ID。"""
        item_list = tuple(items)
        CanvasApplicationOperations.validate_unique_item_refs(item_list)
        current_item_ref: str | None = None
        retry_requests: list[dict[str, Any]] = []

        async def mutate(project: CanvasProject, metadata: dict) -> tuple[dict[str, Any], dict]:
            nonlocal current_item_ref
            results: list[dict[str, Any]] = []
            for item in item_list:
                current_item_ref = item.item_ref
                element = project.canvas.get_element(item.element_id)
                content = element.get_content(item.content_id) if element else None
                if element is None or content is None:
                    raise CanvasDomainError("CONTENT_NOT_FOUND", "The requested Content does not exist.")
                if element.element_type in {"frame", "group"}:
                    raise CanvasDomainError("CONTENT_RETRY_NOT_ALLOWED", "Frame and Group Elements do not have generated Content.")
                detail = CanvasApplicationOperations.get_content_detail(metadata, element.element_id, item.content_id)
                original_parameters = detail.get("generationParameters", {})
                override = item.generation_override.to_dict() if item.generation_override else None
                parameters = CanvasApplicationOperations.merge_generation_override(element.element_type, original_parameters, override)
                idempotency_key = ContentMetadataService.retry_idempotency_key(item.item_ref, element.element_id, content.content_id, parameters)
                if detail.get("retryIdempotencyKey") == idempotency_key:
                    previous_result = detail.get("retryResult")
                    if isinstance(previous_result, dict):
                        results.append({**previous_result, "idempotent_replay": True})
                        continue
                    if detail.get("generationStatus") in {"pending", "processing"}:
                        results.append({"item_ref": item.item_ref, "element_id": element.element_id, "content_id": content.content_id, "status": detail.get("generationStatus"), "generation_task_id": detail.get("generationTaskId"), "next_action": "Call wait_canvas_generation with the same generation_task_id.", "idempotent_replay": True})
                        continue
                if content.fields.generation_status != "failed":
                    raise CanvasDomainError("CONTENT_RETRY_NOT_ALLOWED", "Only failed generated Content can be retried.")
                if detail.get("source") != "generated":
                    raise CanvasDomainError("CONTENT_RETRY_NOT_ALLOWED", "Only generated Content can be retried.")
                retry_count = int(detail.get("retryCount", 0))
                if retry_count >= 2:
                    raise CanvasDomainError("CONTENT_RETRY_LIMIT_REACHED", "This Content has reached the retry limit.")
                capability = self.generation_capabilities.get(element.element_type, parameters.get("model_id"))
                if capability.billable:
                    await self.estimate_guard.validate(
                        project_path=project_path,
                        item_ref=item.item_ref,
                        production_rule=capability.production_rule,
                        parameters=GenerationParameters.from_dict(parameters),
                    )
                previous_status = content.fields.generation_status
                if not isinstance(content.fields, GeneratedMediaContentFields):
                    raise CanvasDomainError("CONTENT_RETRY_NOT_ALLOWED", "Only generated media Content can be retried.")
                content.fields.mark_pending()
                CanvasApplicationOperations.set_content_detail(metadata, element.element_id, item.content_id, CanvasApplicationOperations.start_retry_detail(element.element_id, detail, retry_count + 1, parameters, idempotency_key))
                results.append({"item_ref": item.item_ref, "element_id": element.element_id, "content_id": content.content_id, "status": "pending", "previous_status": previous_status, "retry_count": retry_count + 1, "main_content_id": element.main_content_id})
                retry_requests.append({"item_ref": item.item_ref, "element_id": element.element_id, "content_id": content.content_id, "element_type": element.element_type, "retry_count": retry_count + 1, "parameters": parameters, "retry_idempotency_key": idempotency_key})
            return {"items": results}, metadata

        try:
            result = await self.unit_of_work.transaction_with_sidecar(project_path, mutate)
        except CanvasDomainError as error:
            raise CanvasApplicationOperations.batch_error(list(item_list), current_item_ref, error) from error
        project = await self.repository.read(project_path)
        generated: list[GenerationSubmissionCommand] = []
        for item in retry_requests:
            element = project.canvas.get_element(item["element_id"])
            generated.append(GenerationSubmissionCommand(
                item_ref=item["item_ref"],
                element_id=item["element_id"],
                content_id=item["content_id"],
                element_type=element.element_type if element else "image",
                parameters=GenerationParameters.from_dict(item["parameters"]),
                retry_count=item["retry_count"],
                retry_idempotency_key=item["retry_idempotency_key"],
            ))
        return await self.generation_submission_service.submit_generated(project_path, result, generated, tool_context)
