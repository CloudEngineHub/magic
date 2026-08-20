"""生成结果 Canvas 回写器。"""

from typing import Any

from app.tools.canvas.domain.errors import CanvasDomainError
from app.tools.canvas.generation.result.generation_result_mapper import GenerationResultMapper


class CanvasGenerationResultApplier:
    """校验任务目标并把生成结果写回 Canvas Content。"""

    @staticmethod
    def apply(
        project: Any,
        element_id: str,
        content_id: str,
        status: str,
        output_uri: str | None,
        error_message: str | None,
    ) -> None:
        """只修改程序托管的生成状态和结果字段。"""
        element = project.canvas.get_element(element_id)
        content = element.get_content(content_id) if element else None
        if content is None:
            raise CanvasDomainError("CONTENT_NOT_FOUND", "Generated Content no longer exists.")
        content.fields.update(GenerationResultMapper.to_content_fields(status, output_uri, error_message))
        if not error_message:
            content.fields.pop("errorMessage", None)
