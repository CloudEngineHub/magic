from __future__ import annotations

from dataclasses import dataclass

from magic_use.models.geometry import BoundingBox


@dataclass(frozen=True, slots=True)
class FindQuery:
    role: str | None = None
    name: str | None = None
    text: str | None = None
    visible_only: bool = True
    limit: int = 20

    def __post_init__(self) -> None:
        if not (self.role or self.name or self.text):
            raise ValueError("a find query needs at least one of role, name, or text")
        if self.limit < 1:
            raise ValueError("find limit must be greater than zero")


@dataclass(frozen=True, slots=True)
class FindMatch:
    ref: str
    role: str
    name: str
    text: str
    actions: frozenset[str]
    bounding_box: BoundingBox | None
    in_viewport: bool


@dataclass(frozen=True, slots=True)
class FindResult:
    page_id: str
    matches: tuple[FindMatch, ...]
    truncated: bool
    suggestions: tuple[str, ...] = ()
