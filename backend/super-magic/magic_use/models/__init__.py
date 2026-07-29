from magic_use.models.actions import ActionRequest, ActionResult, ActionTarget, NavigationResult, ScreenshotResult
from magic_use.models.common import (
    ActionKind,
    ActionOutcome,
    BrowserBackendKind,
    BrowserEventType,
    BrowserName,
    PageState,
    SessionState,
    SnapshotScope,
)
from magic_use.models.diagnostics import (
    ConsoleEntry,
    NetworkEntry,
    WaitConditionKind,
    WaitRequest,
)
from magic_use.models.events import BrowserEvent
from magic_use.models.geometry import BoundingBox, Viewport
from magic_use.models.page import BrowserPage
from magic_use.models.refs import ElementRefRecord
from magic_use.models.session import BrowserCapabilities, BrowserIdentity, BrowserSession
from magic_use.models.snapshot import PageSnapshot, SnapshotDiff, SnapshotNode, SnapshotOptions

__all__ = [
    "ActionKind",
    "ActionOutcome",
    "ActionRequest",
    "ActionResult",
    "ActionTarget",
    "BoundingBox",
    "BrowserBackendKind",
    "BrowserCapabilities",
    "BrowserEvent",
    "BrowserEventType",
    "BrowserIdentity",
    "BrowserName",
    "BrowserPage",
    "BrowserSession",
    "ConsoleEntry",
    "ElementRefRecord",
    "NavigationResult",
    "NetworkEntry",
    "PageSnapshot",
    "PageState",
    "ScreenshotResult",
    "SessionState",
    "SnapshotDiff",
    "SnapshotNode",
    "SnapshotOptions",
    "SnapshotScope",
    "Viewport",
    "WaitConditionKind",
    "WaitRequest",
]
