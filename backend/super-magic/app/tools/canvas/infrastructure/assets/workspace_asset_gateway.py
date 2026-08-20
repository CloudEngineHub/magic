"""工作区素材网关实现。"""

from pathlib import Path
from stat import S_ISREG

from app.tools.canvas.domain.errors import CanvasDomainError
from app.tools.canvas.infrastructure.assets.asset_gateway_interface import AssetGateway
from app.utils.async_file_utils import async_exists, async_stat


class WorkspaceAssetGateway(AssetGateway):
    """在 Canvas 工作区内解析并校验素材文件。"""

    def __init__(self, workspace: Path):
        """保存工作区根目录。"""
        self.workspace = workspace

    async def normalize_existing_file(self, asset_path: str) -> str:
        """校验素材存在、位于工作区内且是受支持的普通文件。"""
        candidate = (self.workspace / asset_path).resolve()
        try:
            candidate.relative_to(self.workspace.resolve())
        except ValueError as exc:
            raise CanvasDomainError("ASSET_PATH_INVALID", "Asset path must stay inside the Canvas workspace.") from exc
        if not await async_exists(candidate) or not S_ISREG((await async_stat(candidate)).st_mode):
            raise CanvasDomainError("ASSET_NOT_FOUND", f"Asset file does not exist: {asset_path}.")
        return candidate.relative_to(self.workspace.resolve()).as_posix()
