"""Browser 工具展示层的强类型数据。"""

from __future__ import annotations

from dataclasses import dataclass

from app.core.entity.message.server_message import BrowserDetailStatus


@dataclass(frozen=True, slots=True)
class BrowserPageListStats:
    total: int
    active: int


@dataclass(frozen=True, slots=True)
class BrowserElementListStats:
    nodes: int
    interactive_elements: int
    truncated: bool
    added: int = 0
    removed: int = 0
    changed: int = 0


@dataclass(frozen=True, slots=True)
class BrowserConsoleStats:
    total: int
    errors: int
    warnings: int


@dataclass(frozen=True, slots=True)
class BrowserNetworkStats:
    total: int
    failed: int
    pending: int


BrowserOperationStats = BrowserPageListStats | BrowserElementListStats | BrowserConsoleStats | BrowserNetworkStats


@dataclass(frozen=True, slots=True)
class BrowserOperationPresentation:
    action: str
    summary: str
    status: BrowserDetailStatus
    url: str = ""
    page_title: str = ""
    target: str = ""
    body: str = ""
    stats: BrowserOperationStats | None = None
