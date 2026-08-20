"""生成内容策略。"""

from app.tools.canvas.domain.content_fields.generated_media import GeneratedMediaContentFields
from app.tools.canvas.domain.content_fields.image import ImageContentFields
from app.tools.canvas.domain.content_fields.video import VideoContentFields
from app.tools.canvas.domain.errors import CanvasDomainError
from app.tools.canvas.strategies.content.base_content import BaseContentStrategy
from app.tools.canvas.strategies.content.plan import ContentMutationPlan
from app.tools.canvas.strategies.content.request import ContentStrategyRequest


class GeneratedContentStrategy(BaseContentStrategy):
    """处理生成意图并创建待执行的 Content。"""

    source = "generated"

    def plan(self, request: ContentStrategyRequest) -> ContentMutationPlan:
        """创建 pending Content，具体生成仍由应用层能力端口执行。"""
        command = request.command
        content_type = command.content_type
        if content_type not in {"image", "video"}:
            raise CanvasDomainError("CONTENT_INPUT_INVALID", "Generated Content requires content_type=image or video.")
        content = self._build_base_content(request).content
        if not isinstance(content.fields, GeneratedMediaContentFields):
            raise CanvasDomainError("CONTENT_INPUT_INVALID", "Generated Content requires generated media fields.")
        content.fields.mark_pending()
        request_fields = command.generation_parameters.to_dict() if command.generation_parameters else {}
        if content_type == "image" and isinstance(content.fields, ImageContentFields):
            content.fields.generate_image_request = request_fields
        elif content_type == "video" and isinstance(content.fields, VideoContentFields):
            content.fields.generate_video_request = request_fields
        else:
            raise CanvasDomainError("CONTENT_INPUT_INVALID", "Generated Content fields do not match content_type.")
        return ContentMutationPlan(content)
