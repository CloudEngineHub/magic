"""工作区图片下载适配器。"""

from pathlib import Path

import aiohttp

from app.tools.canvas.production.ports.asset_download_port import AssetDownloadPort
from app.utils.async_file_utils import async_exists, async_rename, async_stat, async_unlink, async_write_bytes_iter


class WorkspaceAssetDownloadPort(AssetDownloadPort):
    """将远程图片流式下载到指定工作区路径。"""

    async def download(self, url: str, target_path: Path) -> None:
        """使用临时文件和原子替换避免留下半文件。"""
        temporary_path = target_path.with_name(f".{target_path.name}.download")
        timeout = aiohttp.ClientTimeout(total=120)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(url) as response:
                if response.status < 200 or response.status >= 300:
                    raise ValueError(f"Image download failed with HTTP {response.status}.")
                await async_write_bytes_iter(temporary_path, response.content.iter_chunked(1024 * 1024))
        if not await async_exists(temporary_path) or (await async_stat(temporary_path)).st_size <= 0:
            await async_unlink(temporary_path)
            raise ValueError("Downloaded image is empty.")
        await async_rename(temporary_path, target_path)
