"""生成内容策略。"""

from app.tools.canvas.domain.errors import CanvasDomainError
from app.tools.canvas.strategies.content.base_content import BaseContentStrategy
from app.tools.canvas.strategies.content.plan import ContentMutationPlan
from app.tools.canvas.strategies.content.request import ContentStrategyRequest


class GeneratedContentStrategy(BaseContentStrategy):
    """处理生成意图并创建待执行的 Content。"""

    source = "generated"

    def plan(self, request: ContentStrategyRequest) -> ContentMutationPlan:
        """创建 pending Content，具体生成仍由应用层能力端口执行。"""
        data = request.data
        content_type = data.get("content_type")
        if content_type not in {"image", "video"}:
            raise CanvasDomainError("CONTENT_INPUT_INVALID", "Generated Content requires content_type=image or video.")
        content = self._build_base_content(request).content
        content.fields["status"] = "pending"
        request_key = "generateImageRequest" if content_type == "image" else "generateVideoRequest"
        request_fields = {
            key: value
            for key, value in data.items()
            if key not in {"source", "content_id", "content_type"} and value is not None
        }
        content.fields.setdefault(request_key, request_fields)
        return ContentMutationPlan(content)
