from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class BoundingBox:
    x: float
    y: float
    width: float
    height: float

    @property
    def center_x(self) -> float:
        return self.x + self.width / 2

    @property
    def center_y(self) -> float:
        return self.y + self.height / 2

    @property
    def area(self) -> float:
        return max(0.0, self.width) * max(0.0, self.height)

    def intersects(self, other: "BoundingBox") -> bool:
        return not (
            self.x + self.width <= other.x
            or other.x + other.width <= self.x
            or self.y + self.height <= other.y
            or other.y + other.height <= self.y
        )


@dataclass(frozen=True, slots=True)
class Viewport:
    width: float
    height: float
    scroll_x: float = 0.0
    scroll_y: float = 0.0
    document_width: float = 0.0
    document_height: float = 0.0

    @property
    def document_rect(self) -> BoundingBox:
        return BoundingBox(
            x=self.scroll_x,
            y=self.scroll_y,
            width=self.width,
            height=self.height,
        )
