from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from playwright.async_api import CDPSession, Page


@dataclass(slots=True)
class PlaywrightPageHandle:
    page_id: str
    page: Page
    cdp: CDPSession | None
    document_generation: int
    opener_page_id: str | None
    expires_at: datetime
    resource_warning: str | None = None


@dataclass(frozen=True, slots=True)
class ClosedPageRecord:
    page_id: str
    url: str
    title: str
    closed_at: datetime
    reason: str
