"""Browser 工具面向用户的展示模型与构建入口。"""

from app.tools.browser.presentation.details import BrowserDetailBuilder
from app.tools.browser.presentation.models import (
    BrowserConsoleStats,
    BrowserNetworkStats,
    BrowserOperationPresentation,
    BrowserPageListStats,
    BrowserSnapshotStats,
)
from app.tools.browser.presentation.remarks import BrowserRemarkBuilder

__all__ = [
    "BrowserConsoleStats",
    "BrowserDetailBuilder",
    "BrowserNetworkStats",
    "BrowserOperationPresentation",
    "BrowserPageListStats",
    "BrowserRemarkBuilder",
    "BrowserSnapshotStats",
]
