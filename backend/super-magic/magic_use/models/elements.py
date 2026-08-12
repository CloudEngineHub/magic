from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from magic_use.models.common import ElementScope
from magic_use.models.geometry import BoundingBox, Viewport
from magic_use.models.refs import ElementRefRecord


@dataclass(frozen=True, slots=True)
class ElementNode:
    role: str
    name: str
    description: str
    text: str
    value: str
    states: frozenset[str]
    actions: frozenset[str]
    visible: bool
    in_viewport: bool
    occluded: bool
    bounding_box: BoundingBox | None
    frame_id: str
    depth: int
    ref: str | None = None
    children: tuple["ElementNode", ...] = ()


@dataclass(frozen=True, slots=True)
class ElementDiff:
    added: tuple[str, ...] = ()
    removed: tuple[str, ...] = ()
    changed: tuple[str, ...] = ()

    @property
    def has_changes(self) -> bool:
        return bool(self.added or self.removed or self.changed)


@dataclass(frozen=True, slots=True)
class PageElements:
    id: str
    session_id: str
    page_id: str
    document_generation: int
    scope: ElementScope
    url: str
    title: str
    viewport: Viewport
    root_nodes: tuple[ElementNode, ...]
    refs: tuple[ElementRefRecord, ...]
    truncated: bool
    created_at: datetime
    diff: ElementDiff | None = None


@dataclass(frozen=True, slots=True)
class ElementQuery:
    scope: ElementScope = ElementScope.INTERACTIVE
    root_ref: str | None = None
    max_nodes: int = 500
    max_depth: int = 30

    def __post_init__(self) -> None:
        if self.scope is ElementScope.SUBTREE and self.root_ref is None:
            raise ValueError("root_ref is required for subtree snapshots")
        if self.max_nodes < 1:
            raise ValueError("max_nodes must be greater than zero")
        if self.max_depth < 1:
            raise ValueError("max_depth must be greater than zero")
