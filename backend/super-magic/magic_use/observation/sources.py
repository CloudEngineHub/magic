from __future__ import annotations

from dataclasses import dataclass
from types import MappingProxyType
from typing import Mapping

from magic_use.models.geometry import BoundingBox, Viewport


@dataclass(frozen=True, slots=True)
class AccessibilityNodeSource:
    node_id: str
    parent_node_id: str | None
    child_node_ids: tuple[str, ...]
    backend_node_id: int | None
    frame_id: str
    role: str
    name: str
    description: str
    value: str
    properties: Mapping[str, str | bool | float]
    ignored: bool

    def __post_init__(self) -> None:
        object.__setattr__(self, "properties", MappingProxyType(dict(self.properties)))


@dataclass(frozen=True, slots=True)
class DOMNodeSource:
    backend_node_id: int
    parent_backend_node_id: int | None
    node_name: str
    node_value: str
    attributes: Mapping[str, str]
    bounding_box: BoundingBox | None
    paint_order: int | None
    structural_path: tuple[int, ...]

    def __post_init__(self) -> None:
        object.__setattr__(self, "attributes", MappingProxyType(dict(self.attributes)))


@dataclass(frozen=True, slots=True)
class ProbeNodeSource:
    role: str
    name: str
    tag: str
    attributes: Mapping[str, str]
    states: frozenset[str]
    actions: frozenset[str]
    visible: bool
    in_viewport: bool
    occluded: bool
    bounding_box: BoundingBox | None
    structural_path: tuple[int, ...]

    def __post_init__(self) -> None:
        object.__setattr__(self, "attributes", MappingProxyType(dict(self.attributes)))


@dataclass(frozen=True, slots=True)
class SnapshotSources:
    accessibility: tuple[AccessibilityNodeSource, ...]
    dom: tuple[DOMNodeSource, ...]
    probe: tuple[ProbeNodeSource, ...]
    viewport: Viewport
