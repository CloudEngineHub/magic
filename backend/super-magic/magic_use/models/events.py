from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from magic_use.models.common import BrowserEventType, JsonValue


@dataclass(frozen=True, slots=True)
class BrowserEvent:
    type: BrowserEventType
    session_id: str
    page_id: str | None
    occurred_at: datetime
    data: dict[str, JsonValue]
