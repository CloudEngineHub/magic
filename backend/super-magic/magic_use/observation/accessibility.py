from __future__ import annotations

from typing import Protocol

from magic_use.models.common import JsonValue
from magic_use.observation.sources import AccessibilityNodeSource


class CDPClient(Protocol):
    async def send(self, method: str, params: dict[str, JsonValue] | None = None) -> dict[str, JsonValue]: ...


class AccessibilityCollector:
    async def collect(self, cdp: CDPClient) -> tuple[AccessibilityNodeSource, ...]:
        payload = await cdp.send("Accessibility.getFullAXTree")
        raw_nodes = payload.get("nodes", [])
        if not isinstance(raw_nodes, list):
            return ()

        parent_by_child: dict[str, str] = {}
        for raw_node in raw_nodes:
            if not isinstance(raw_node, dict):
                continue
            node_id = raw_node.get("nodeId")
            child_ids = raw_node.get("childIds", [])
            if isinstance(node_id, str) and isinstance(child_ids, list):
                for child_id in child_ids:
                    if isinstance(child_id, str):
                        parent_by_child[child_id] = node_id

        nodes: list[AccessibilityNodeSource] = []
        for raw_node in raw_nodes:
            if not isinstance(raw_node, dict):
                continue
            node_id = raw_node.get("nodeId")
            if not isinstance(node_id, str):
                continue
            child_ids = raw_node.get("childIds", [])
            properties: dict[str, str | bool | float] = {}
            raw_properties = raw_node.get("properties", [])
            if isinstance(raw_properties, list):
                for prop in raw_properties:
                    if not isinstance(prop, dict):
                        continue
                    name = prop.get("name")
                    value = prop.get("value")
                    if not isinstance(name, str) or not isinstance(value, dict):
                        continue
                    raw_value = value.get("value")
                    if isinstance(raw_value, (str, bool, int, float)):
                        properties[name] = raw_value

            nodes.append(
                AccessibilityNodeSource(
                    node_id=node_id,
                    parent_node_id=parent_by_child.get(node_id),
                    child_node_ids=tuple(value for value in child_ids if isinstance(value, str))
                    if isinstance(child_ids, list)
                    else (),
                    backend_node_id=self._optional_int(raw_node.get("backendDOMNodeId")),
                    frame_id=self._string_value(raw_node.get("frameId")),
                    role=self._property_value(raw_node.get("role")).lower(),
                    name=self._property_value(raw_node.get("name")),
                    description=self._property_value(raw_node.get("description")),
                    value=self._property_value(raw_node.get("value")),
                    properties=properties,
                    ignored=raw_node.get("ignored") is True,
                )
            )
        return tuple(nodes)

    @staticmethod
    def _property_value(value: JsonValue) -> str:
        if not isinstance(value, dict):
            return ""
        raw_value = value.get("value")
        return str(raw_value) if raw_value is not None else ""

    @staticmethod
    def _string_value(value: JsonValue) -> str:
        return value if isinstance(value, str) else ""

    @staticmethod
    def _optional_int(value: JsonValue) -> int | None:
        return value if isinstance(value, int) else None
