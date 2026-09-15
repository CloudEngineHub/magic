from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from magic_use.models.common import BrowserBackendKind, BrowserName, SessionState


@dataclass(frozen=True, slots=True)
class BrowserCapabilities:
    browser_name: BrowserName
    browser_version: str
    backend: BrowserBackendKind
    protocol_version: str
    accessibility_tree: bool
    dom_snapshot: bool
    page_script: bool
    screenshots: bool
    labeled_screenshots: bool
    console: bool
    network: bool
    file_upload: bool
    downloads: bool
    trace: bool = False
    video: bool = False


@dataclass(frozen=True, slots=True)
class BrowserIdentity:
    name: BrowserName
    version: str


@dataclass(frozen=True, slots=True)
class BrowserSession:
    id: str
    backend: BrowserBackendKind
    state: SessionState
    capabilities: BrowserCapabilities
    created_at: datetime
    expires_at: datetime | None
    browser_identity: BrowserIdentity
    page_ids: tuple[str, ...]
