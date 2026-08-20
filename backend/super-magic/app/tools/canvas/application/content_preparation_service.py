"""Canvas Content 创建前准备服务。"""

from app.tools.canvas.application.commands import ContentCommand
from app.tools.canvas.domain.errors import CanvasDomainError
from app.tools.canvas.domain.models import CanvasContent, CanvasProject
from app.tools.canvas.domain.content_fields.generated_media import GeneratedMediaContentFields
from app.tools.canvas.infrastructure.assets import AssetGateway
from app.tools.canvas.strategies import ContentStrategyRegistry


class ContentPreparationService:
    """负责 Content 构建和 imported 素材规范化。"""

    def __init__(self, content_strategies: ContentStrategyRegistry, asset_gateway: AssetGateway):
        """显式保存 Content 策略和素材网关。"""
        self.content_strategies = content_strategies
        self.asset_gateway = asset_gateway

    def build(self, command: ContentCommand, element_type: str) -> CanvasContent:
        """把强类型命令转换为领域 Content。"""
        return self.content_strategies.build(command, element_type)

    async def prepare_imported(self, project: CanvasProject, command: ContentCommand) -> None:
        """规范化 imported 素材路径并阻止同一素材重复登记。"""
        if not command.is_imported:
            return
        normalized = await self.asset_gateway.normalize_existing_file(command.asset_path or "")
        existing_paths = {
            content.fields.asset_path
            for element in project.canvas.iter_elements()
            for content in element.contents
            if content.fields.asset_path
        }
        if normalized in existing_paths:
            raise CanvasDomainError("ASSET_ALREADY_REGISTERED", f"Imported asset is already registered: {normalized}.")
        if not isinstance(command.fields, GeneratedMediaContentFields):
            raise CanvasDomainError("CONTENT_INPUT_INVALID", "Imported media Content must expose a src field.")
        command.fields.src = normalized
