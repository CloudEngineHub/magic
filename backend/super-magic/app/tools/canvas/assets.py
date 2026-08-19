"""Canvas 工作区素材访问端口。

素材路径校验独立于 Content 策略和 Application，用于约束 imported Content
只能登记真实存在的工作区文件，并为未来远程素材实现保留替换边界。
"""

from __future__ import annotations

import stat
from pathlib import Path
from typing import Protocol

from app.tools.canvas.domain.errors import CanvasDomainError
from app.tools.canvas.repository import CanvasPathResolver
from app.utils.async_file_utils import async_exists, async_stat


class AssetGateway(Protocol):
    """定义 imported Content 所需的素材访问能力。"""

    async def normalize_existing_file(self, asset_path: str) -> str:
        """校验素材并返回规范化的工作区相对路径。"""


class WorkspaceAssetGateway:
    """读取当前工作区内的本地素材。"""

    def __init__(self, workspace: Path):
        """保存工作区根目录。"""
        self.workspace = workspace

    async def normalize_existing_file(self, asset_path: str) -> str:
        """拒绝工作区外路径、目录和不存在的素材。"""
        try:
            resolved = CanvasPathResolver.resolve(self.workspace, asset_path)
        except ValueError as exc:
            raise CanvasDomainError(
                "ASSET_PATH_INVALID",
                "Imported asset path must be a workspace-relative path.",
            ) from exc
        if not await async_exists(resolved) or not stat.S_ISREG((await async_stat(resolved)).st_mode):
            raise CanvasDomainError("ASSET_NOT_FOUND", f"Imported asset does not exist: {asset_path}.")
        return resolved.relative_to(self.workspace.resolve()).as_posix()
