from __future__ import annotations

from typing import Protocol

from magic_use.models.common import JsonValue
from magic_use.models.geometry import BoundingBox, Viewport
from magic_use.observation.sources import ProbeNodeSource
from magic_use.scripts.injector import ScriptInjector


class ProbePage(Protocol):
    async def evaluate(self, expression: str, arg: JsonValue = None) -> JsonValue: ...


class PageProbeCollector:
    def __init__(self, injector: ScriptInjector) -> None:
        self._injector = injector

    async def collect(self, page: ProbePage) -> tuple[tuple[ProbeNodeSource, ...], Viewport]:
        await self._injector.ensure(page, "touch")
        payload = await page.evaluate("() => globalThis.MagicTouch.collectProbe()")
        if not isinstance(payload, dict):
            return (), Viewport(0, 0)

        raw_viewport = payload.get("viewport", {})
        viewport = Viewport(
            width=self._number(raw_viewport, "width"),
            height=self._number(raw_viewport, "height"),
            scroll_x=self._number(raw_viewport, "scrollX"),
            scroll_y=self._number(raw_viewport, "scrollY"),
            document_width=self._number(raw_viewport, "documentWidth"),
            document_height=self._number(raw_viewport, "documentHeight"),
        )
        raw_nodes = payload.get("nodes", [])
        if not isinstance(raw_nodes, list):
            return (), viewport

        nodes: list[ProbeNodeSource] = []
        for raw_node in raw_nodes:
            if not isinstance(raw_node, dict):
                continue
            nodes.append(
                ProbeNodeSource(
                    role=self._string(raw_node.get("role")),
                    name=self._string(raw_node.get("name")),
                    tag=self._string(raw_node.get("tag")),
                    attributes=self._string_dict(raw_node.get("attributes")),
                    states=frozenset(self._string_list(raw_node.get("states"))),
                    actions=frozenset(self._string_list(raw_node.get("actions"))),
                    visible=raw_node.get("visible") is True,
                    in_viewport=raw_node.get("inViewport") is True,
                    occluded=raw_node.get("occluded") is True,
                    bounding_box=self._rect(raw_node.get("rect")),
                    structural_path=tuple(self._int_list(raw_node.get("path"))),
                )
            )
        return tuple(nodes), viewport

    @staticmethod
    def _number(value: JsonValue, key: str) -> float:
        if not isinstance(value, dict):
            return 0.0
        item = value.get(key)
        return float(item) if isinstance(item, (int, float)) else 0.0

    @staticmethod
    def _string(value: JsonValue) -> str:
        return value if isinstance(value, str) else ""

    @staticmethod
    def _string_dict(value: JsonValue) -> dict[str, str]:
        if not isinstance(value, dict):
            return {}
        return {key: item for key, item in value.items() if isinstance(item, str)}

    @staticmethod
    def _string_list(value: JsonValue) -> list[str]:
        if not isinstance(value, list):
            return []
        return [item for item in value if isinstance(item, str)]

    @staticmethod
    def _int_list(value: JsonValue) -> list[int]:
        if not isinstance(value, list):
            return []
        return [item for item in value if isinstance(item, int)]

    @staticmethod
    def _rect(value: JsonValue) -> BoundingBox | None:
        if not isinstance(value, dict):
            return None
        components = [value.get(key) for key in ("x", "y", "width", "height")]
        if not all(isinstance(item, (int, float)) for item in components):
            return None
        return BoundingBox(*(float(item) for item in components))
