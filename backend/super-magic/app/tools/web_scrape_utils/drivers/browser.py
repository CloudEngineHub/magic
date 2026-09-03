from agentlang.logger import get_logger
from app.path_manager import PathManager
from app.service.browser.browser_config_adapter import BrowserConfigAdapter
from app.tools.driver_log_utils import to_log_text
from app.tools.web_scrape_utils.drivers.base import WebScrapeDriverInterface, WebScrapeResultItem
from app.tools.webview_utils import generate_search_engine_referer
from magic_use import create_browser

logger = get_logger(__name__)


class BrowserWebScrapeDriver(WebScrapeDriverInterface):
    """浏览器抓取驱动

    使用无头浏览器抓取网页内容。降级方案通过 web-collector 的 magic_service 驱动实现。
    """

    def is_available(self) -> bool:
        return True

    async def scrape(self, url: str) -> WebScrapeResultItem:
        """使用浏览器抓取网页"""
        logger.info(f"[BrowserWebScrapeDriver] request scrape url={to_log_text(url)}")
        config = await BrowserConfigAdapter.build_playwright(str(PathManager.get_workspace_dir()))
        browser = await create_browser(config)
        try:
            pages = await browser.list_pages()
            if not pages:
                raise RuntimeError("获取页面ID失败")
            page_id = pages[0].id
            page = await browser.navigate(page_id, url, referer=generate_search_engine_referer(url))

            markdown = await browser.read_page(page_id, scope="all")

            logger.info(
                "[BrowserWebScrapeDriver] response "
                f"title={to_log_text(page.title or '')} "
                f"markdown={to_log_text(markdown)}"
            )

            return WebScrapeResultItem(
                markdown=markdown,
                site_name=page.title or "",
            )
        finally:
            try:
                await browser.close()
            except Exception as e:
                logger.debug(f"关闭浏览器实例出错: {e}")

    async def fallback_scrape(self, url: str) -> WebScrapeResultItem:
        """降级抓取：通过 magic-service API 重新获取"""
        from app.tools.web_scrape_utils.drivers.magic_service import MagicServiceWebScrapeDriver

        fallback = MagicServiceWebScrapeDriver()
        if not fallback.is_available():
            raise RuntimeError("降级抓取不可用: MAGIC_API_KEY 或 MAGIC_API_SERVICE_BASE_URL 未配置")
        return await fallback.scrape(url)
