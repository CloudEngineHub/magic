from __future__ import annotations

from enum import Enum
from typing import TypeAlias

JsonScalar: TypeAlias = str | int | float | bool | None
JsonValue: TypeAlias = JsonScalar | list["JsonValue"] | dict[str, "JsonValue"]


class BrowserBackendKind(str, Enum):
    LOCAL_PLAYWRIGHT = "local_playwright"
    REMOTE_PLAYWRIGHT = "remote_playwright"
    CHROME_EXTENSION = "chrome_extension"


class BrowserName(str, Enum):
    CHROMIUM = "chromium"
    FIREFOX = "firefox"
    WEBKIT = "webkit"


class SessionState(str, Enum):
    STARTING = "starting"
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    FAILED = "failed"
    CLOSED = "closed"


class PageState(str, Enum):
    OPEN = "open"
    CLOSED = "closed"
    FAILED = "failed"


class SnapshotScope(str, Enum):
    INTERACTIVE = "interactive"
    VIEWPORT = "viewport"
    SUBTREE = "subtree"
    FULL = "full"
    CHANGES = "changes"


class ActionKind(str, Enum):
    CLICK = "click"
    FILL = "fill"
    PRESS = "press"
    HOVER = "hover"
    SCROLL = "scroll"
    SELECT = "select"
    CHECK = "check"
    UPLOAD = "upload"


class ActionOutcome(str, Enum):
    COMPLETED = "completed"
    DISPATCHED = "dispatched"
    NO_CHANGE = "no_change"
    FAILED = "failed"


class BrowserEventType(str, Enum):
    SESSION_CONNECTED = "session.connected"
    SESSION_DISCONNECTED = "session.disconnected"
    SESSION_RESUMED = "session.resumed"
    SESSION_CLOSED = "session.closed"
    PAGE_OPENED = "page.opened"
    PAGE_CLOSED = "page.closed"
    PAGE_EXPIRED = "page.expired"
    PAGE_ACTIVATED = "page.activated"
    NAVIGATION_STARTED = "navigation.started"
    NAVIGATION_COMMITTED = "navigation.committed"
    NAVIGATION_COMPLETED = "navigation.completed"
    NAVIGATION_FAILED = "navigation.failed"
    FRAME_ATTACHED = "frame.attached"
    FRAME_DETACHED = "frame.detached"
    FRAME_NAVIGATED = "frame.navigated"
    DIALOG_OPENED = "dialog.opened"
    DIALOG_CLOSED = "dialog.closed"
    DOWNLOAD_STARTED = "download.started"
    DOWNLOAD_COMPLETED = "download.completed"
    DOWNLOAD_FAILED = "download.failed"
    CONSOLE = "console"
    NETWORK_REQUEST = "network.request"
    NETWORK_RESPONSE = "network.response"
    NETWORK_FAILED = "network.failed"
