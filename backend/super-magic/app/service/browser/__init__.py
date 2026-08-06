"""Super Magic 对独立 magic_use SDK 的宿主适配层。"""

from app.service.browser.browser_artifact_service import BrowserArtifactService, BrowserScreenshotArtifact
from app.service.browser.browser_config_adapter import BrowserConfigAdapter
from app.service.browser.browser_playwright_runtime import SharedBrowserRuntime
from app.service.browser.browser_runtime_registry import BrowserRuntimeEntry, BrowserRuntimeRegistry
from app.service.browser.browser_service import BrowserService, ChromeBrowserSession
from app.service.browser.chrome_extension_connection_registry import ChromeExtensionConnectionRegistry

__all__ = [
    "BrowserArtifactService",
    "BrowserScreenshotArtifact",
    "BrowserConfigAdapter",
    "BrowserRuntimeEntry",
    "BrowserRuntimeRegistry",
    "BrowserService",
    "ChromeBrowserSession",
    "ChromeExtensionConnectionRegistry",
    "SharedBrowserRuntime",
]
