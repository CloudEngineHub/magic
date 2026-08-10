import asyncio
from dataclasses import replace
from io import BytesIO
from pathlib import Path
from typing import Optional

from PIL import Image

from agentlang.logger import get_logger
from app.service.browser.browser_config_adapter import BrowserConfigAdapter
from app.tools.screenshot_utils.drivers.base import ScreenshotDriverInterface, ScreenshotResultItem
from app.utils.async_file_utils import async_mkdir, async_stat, async_write_bytes
from magic_use import WaitConditionKind, WaitRequest, create_browser

logger = get_logger(__name__)


class BrowserScreenshotDriver(ScreenshotDriverInterface):
    """独立 Browser SDK 截图驱动。"""

    def is_available(self) -> bool:
        return True

    async def screenshot(
        self,
        url: str,
        dest: Path,
        full_page: bool = False,
        width: int = 1280,
        height: int = 720,
        wait_for: Optional[str] = None,
        format: str = "png",
    ) -> ScreenshotResultItem:
        """使用独立 Browser SDK 打开页面并截图。"""
        await async_mkdir(dest.parent, parents=True, exist_ok=True)

        config = await BrowserConfigAdapter.build_playwright(str(dest.parent))
        config = replace(
            config,
            context=replace(config.context, viewport_width=width, viewport_height=height),
        )
        browser = await create_browser(config)
        try:
            pages = await browser.list_pages()
            if not pages:
                raise Exception("无法获取浏览器活跃页面")
            page_id = pages[0].id
            await browser.navigate(page_id, url)

            try:
                await browser.wait(
                    page_id,
                    WaitRequest(
                        condition=WaitConditionKind.LOAD_STATE,
                        state="networkidle",
                        timeout_ms=10_000,
                    ),
                )
            except Exception:
                pass

            if wait_for:
                deadline = asyncio.get_running_loop().time() + 5
                while asyncio.get_running_loop().time() < deadline:
                    visible = await browser.evaluate(
                        page_id,
                        """selector => {
                          const element = document.querySelector(selector);
                          if (!element) return false;
                          const style = getComputedStyle(element);
                          const rect = element.getBoundingClientRect();
                          return style.display !== "none"
                            && style.visibility !== "hidden"
                            && Number(style.opacity || "1") > 0
                            && rect.width > 0
                            && rect.height > 0;
                        }""",
                        wait_for,
                    )
                    if visible:
                        break
                    await asyncio.sleep(0.1)

            result = await browser.screenshot(page_id, full_page=full_page)
            image = result.image
            if format.lower() != "png":
                image = await asyncio.to_thread(self._convert_png, image, format)
            await async_write_bytes(dest, image)
        finally:
            await browser.close()

        file_size = (await async_stat(dest)).st_size

        logger.info(f"[browser] 截图完成: {url} -> {dest}, size={file_size}")
        return ScreenshotResultItem(
            file_path=dest,
            format=format,
            width=width,
            height=height,
            file_size=file_size,
        )

    @staticmethod
    def _convert_png(image: bytes, target_format: str) -> bytes:
        output = BytesIO()
        pillow_format = "JPEG" if target_format.lower() in {"jpg", "jpeg"} else target_format.upper()
        with Image.open(BytesIO(image)) as source:
            if pillow_format == "JPEG" and source.mode not in {"RGB", "L"}:
                source.convert("RGB").save(output, format=pillow_format)
            else:
                source.save(output, format=pillow_format)
        return output.getvalue()
