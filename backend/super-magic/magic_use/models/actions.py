from __future__ import annotations

from dataclasses import dataclass

from magic_use.models.common import ActionKind, ActionOutcome
from magic_use.models.page import BrowserPage
from magic_use.models.refs import ElementRefRecord
from magic_use.models.snapshot import SnapshotDiff


@dataclass(frozen=True, slots=True)
class ActionRequest:
    action: ActionKind
    ref: str | None = None
    text: str | None = None
    key: str | None = None
    value: str | None = None
    checked: bool | None = None
    delta_x: float = 0.0
    delta_y: float = 0.0
    file_paths: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if self.ref is not None and not self.ref.strip():
            raise ValueError("ref cannot be empty")

        if self.action in {ActionKind.CLICK, ActionKind.HOVER} and self.ref is None:
            raise ValueError(f"ref is required for {self.action.value}")
        if self.action is ActionKind.FILL and (self.ref is None or self.text is None):
            raise ValueError("ref and text are required for fill")
        if self.action is ActionKind.PRESS and not self.key:
            raise ValueError("key is required for press")
        if self.action is ActionKind.SELECT and (self.ref is None or self.value is None):
            raise ValueError("ref and value are required for select")
        if self.action is ActionKind.CHECK and (self.ref is None or self.checked is None):
            raise ValueError("ref and checked are required for check")
        if self.action is ActionKind.UPLOAD:
            if self.ref is None or not self.file_paths:
                raise ValueError("ref and at least one file path are required for upload")
            if any(not path for path in self.file_paths):
                raise ValueError("upload file paths cannot be empty")
        if self.action is ActionKind.SCROLL and self.ref is None and self.delta_x == 0 and self.delta_y == 0:
            raise ValueError("page scrolling requires a non-zero delta when ref is omitted")


@dataclass(frozen=True, slots=True)
class NavigationResult:
    page: BrowserPage
    committed: bool


@dataclass(frozen=True, slots=True)
class ActionTarget:
    role: str
    name: str
    text: str
    is_sensitive: bool = False

    @classmethod
    def from_ref_record(cls, record: ElementRefRecord) -> "ActionTarget":
        """从已解析的 ref 生成稳定展示信息，不泄露浏览器内部定位字段。"""
        return cls(
            role=record.role,
            name=record.accessible_name,
            text=record.text,
            is_sensitive=record.attributes.get("type", "").lower() == "password",
        )


@dataclass(frozen=True, slots=True)
class ActionState:
    value: str | None = None
    label: str | None = None


@dataclass(frozen=True, slots=True)
class ActionResult:
    ok: bool
    action: ActionKind
    page_id: str
    ref: str | None
    outcome: ActionOutcome
    navigation: NavigationResult | None = None
    opened_pages: tuple[BrowserPage, ...] = ()
    downloads: tuple[str, ...] = ()
    dialogs: tuple[str, ...] = ()
    snapshot_diff: SnapshotDiff | None = None
    target: ActionTarget | None = None
    post_action_state: ActionState | None = None
    message: str = ""


@dataclass(frozen=True, slots=True)
class ScreenshotResult:
    page_id: str
    image: bytes
    full_page: bool
    labels: tuple[tuple[str, str], ...] = ()
