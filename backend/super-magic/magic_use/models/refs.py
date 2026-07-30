from __future__ import annotations

from dataclasses import dataclass
from types import MappingProxyType
from typing import Mapping

from magic_use.models.common import ActionKind
from magic_use.models.geometry import BoundingBox


@dataclass(frozen=True, slots=True)
class ElementRefRecord:
    ref: str
    snapshot_id: str
    session_id: str
    page_id: str
    document_generation: int
    frame_id: str
    backend_node_id: int | None
    object_id: str | None
    role: str
    accessible_name: str
    text: str
    attributes: Mapping[str, str]
    allowed_actions: frozenset[ActionKind]
    structural_path: tuple[int, ...]
    bounding_box: BoundingBox | None
    stable_fingerprint: str

    def __post_init__(self) -> None:
        object.__setattr__(self, "attributes", MappingProxyType(dict(self.attributes)))
