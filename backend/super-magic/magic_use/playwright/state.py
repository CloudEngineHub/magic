from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from playwright.async_api import CDPSession, Page

from magic_use.models.common import PageReadiness


@dataclass(slots=True)
class PlaywrightPageHandle:
    page_id: str
    page: Page
    cdp: CDPSession | None
    document_generation: int
    opener_page_id: str | None
    expires_at: datetime
    resource_warning: str | None = None
    readiness: PageReadiness = PageReadiness.LOADING
    url_history: list[str] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class ClosedPageRecord:
    page_id: str
    url: str
    title: str
    closed_at: datetime
    reason: str
