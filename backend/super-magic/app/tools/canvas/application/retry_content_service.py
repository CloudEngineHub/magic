"""失败 Content 重试用例服务。"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from agentlang.context.tool_context import ToolContext

from app.tools.canvas.application.commands import RetryContentCommand
from app.tools.canvas.application.support import CanvasApplicationSupport
from app.tools.canvas.infrastructure.persistence.content_metadata_service import ContentMetadataService
from app.tools.canvas.domain.errors import CanvasDomainError
from app.tools.canvas.domain.models import CanvasProject


class RetryContentService(CanvasApplicationSupport):
    """Canvas RetryContentService 用例服务。"""

    def __init__(self, dependencies, generation_submission_service):
        """绑定共享依赖和生成提交服务。"""
        super().__init__(dependencies)
        self.generation_submission_service = generation_submission_service

    async def retry_content(self, project_path: str, items: Sequence[RetryContentCommand], tool_context: ToolContext | None = None) -> dict[str, Any]:
        """校验失败 Content 的受控重试边界，并复用原 Content ID。"""
        item_list = tuple(items)
        self.validate_unique_item_refs(item_list)
        current_item_ref: str | None = None
        retry_requests: list[dict[str, Any]] = []

        def mutate(project: CanvasProject, metadata: dict) -> tuple[dict[str, Any], dict]:
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
                detail = self.get_content_detail(metadata, element.element_id, item.content_id)
                original_parameters = detail.get("generationParameters", {})
                override = item.generation_override.to_dict() if item.generation_override else None
                parameters = self.merge_generation_override(element.element_type, original_parameters, override)
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
                self.generation_capabilities.get(element.element_type, parameters.get("model_id"))
                previous_status = content.fields.generation_status
                if not hasattr(content.fields, "mark_pending"):
                    raise CanvasDomainError("CONTENT_RETRY_NOT_ALLOWED", "Only generated media Content can be retried.")
                content.fields.mark_pending()
                self.set_content_detail(metadata, element.element_id, item.content_id, self.start_retry_detail(element.element_id, detail, retry_count + 1, parameters, idempotency_key))
                results.append({"item_ref": item.item_ref, "element_id": element.element_id, "content_id": content.content_id, "status": "pending", "previous_status": previous_status, "retry_count": retry_count + 1, "main_content_id": element.main_content_id})
                retry_requests.append({"item_ref": item.item_ref, "element_id": element.element_id, "content_id": content.content_id, "element_type": element.element_type, "retry_count": retry_count + 1, "parameters": parameters, "retry_idempotency_key": idempotency_key})
            return {"items": results}, metadata

        try:
            result = await self.unit_of_work.transaction_with_sidecar(project_path, mutate)
        except CanvasDomainError as error:
            raise self.batch_error(list(item_list), current_item_ref, error) from error
        project = await self.repository.read(project_path)
        generated = []
        for item in retry_requests:
            element = project.canvas.get_element(item["element_id"])
            generated.append({**item, "element_type": element.element_type if element else "image"})
        return await self.generation_submission_service.submit_generated(project_path, result, generated, tool_context)
