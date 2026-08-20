"""Canvas 素材网关抽象接口。"""

from abc import ABC, abstractmethod


class AssetGateway(ABC):
    """定义工作区素材规范化边界。"""

    @abstractmethod
    async def normalize_existing_file(self, project_path: str, asset_path: str) -> str:
        """校验并返回当前项目可消费的素材路径。"""
