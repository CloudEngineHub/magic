"""工作区图片下载适配器。"""

from pathlib import Path

import aiohttp

from app.tools.canvas.production.ports.asset_download_port import AssetDownloadPort
from app.utils.async_file_utils import async_exists, async_stat, async_unlink, async_write_bytes_iter


class WorkspaceAssetDownloadPort(AssetDownloadPort):
    """将远程图片流式下载到指定工作区路径。"""

    async def download(self, url: str, target_path: Path) -> None:
        """直接把远程响应流写入工作区目标文件。"""
        timeout = aiohttp.ClientTimeout(total=120)
        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(url) as response:
                    if response.status < 200 or response.status >= 300:
                        raise ValueError(f"Image download failed with HTTP {response.status}.")
                    await async_write_bytes_iter(target_path, response.content.iter_chunked(1024 * 1024))
            if not await async_exists(target_path) or (await async_stat(target_path)).st_size <= 0:
                raise ValueError("Downloaded image is empty.")
        except Exception:
            await async_unlink(target_path)
            raise
