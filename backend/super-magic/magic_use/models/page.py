from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from magic_use.models.common import PageState


@dataclass(frozen=True, slots=True)
class BrowserPage:
    id: str
    session_id: str
    target_id: str
    url: str
    title: str
    state: PageState
    active: bool
    opener_page_id: str | None
    document_generation: int
    expires_at: datetime | None = None
    resource_warning: str | None = None
