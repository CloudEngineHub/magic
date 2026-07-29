from __future__ import annotations

from magic_use.models.geometry import BoundingBox
from magic_use.observation.accessibility import CDPClient
from magic_use.observation.sources import DOMNodeSource


class DOMSnapshotCollector:
    async def collect(self, cdp: CDPClient) -> tuple[DOMNodeSource, ...]:
        payload = await cdp.send(
            "DOMSnapshot.captureSnapshot",
            {
                "computedStyles": [],
                "includePaintOrder": True,
                "includeDOMRects": True,
            },
        )
        strings = payload.get("strings", [])
        documents = payload.get("documents", [])
        if not isinstance(strings, list) or not isinstance(documents, list):
            return ()

        result: list[DOMNodeSource] = []
        for document in documents:
            if not isinstance(document, dict):
                continue
            raw_nodes = document.get("nodes")
            layout = document.get("layout")
            if not isinstance(raw_nodes, dict) or not isinstance(layout, dict):
                continue

            names = raw_nodes.get("nodeName", [])
            values = raw_nodes.get("nodeValue", [])
            parents = raw_nodes.get("parentIndex", [])
            backend_ids = raw_nodes.get("backendNodeId", [])
            attributes = raw_nodes.get("attributes", [])
            layout_indices = layout.get("nodeIndex", [])
            bounds = layout.get("bounds", [])
            paint_orders = layout.get("paintOrders", [])
            rect_by_node: dict[int, BoundingBox] = {}
            paint_by_node: dict[int, int] = {}
            if isinstance(layout_indices, list):
                for offset, node_index in enumerate(layout_indices):
                    if not isinstance(node_index, int):
                        continue
                    if isinstance(bounds, list) and offset < len(bounds):
                        rect = self._rect(bounds[offset])
                        if rect is not None:
                            rect_by_node[node_index] = rect
                    if isinstance(paint_orders, list) and offset < len(paint_orders):
                        paint_order = paint_orders[offset]
                        if isinstance(paint_order, int):
                            paint_by_node[node_index] = paint_order

            count = len(backend_ids) if isinstance(backend_ids, list) else 0
            paths = self._structural_paths(parents, count)
            for index in range(count):
                backend_id = backend_ids[index]
                if not isinstance(backend_id, int):
                    continue
                parent_backend_id = None
                if isinstance(parents, list) and index < len(parents):
                    parent_index = parents[index]
                    if isinstance(parent_index, int) and 0 <= parent_index < count:
                        candidate = backend_ids[parent_index]
                        if isinstance(candidate, int):
                            parent_backend_id = candidate
                result.append(
                    DOMNodeSource(
                        backend_node_id=backend_id,
                        parent_backend_node_id=parent_backend_id,
                        node_name=self._string_at(strings, names, index).lower(),
                        node_value=self._string_at(strings, values, index),
                        attributes=self._attributes(strings, attributes, index),
                        bounding_box=rect_by_node.get(index),
                        paint_order=paint_by_node.get(index),
                        structural_path=paths[index],
                    )
                )
        return tuple(result)

    @staticmethod
    def _rect(value: object) -> BoundingBox | None:
        if not isinstance(value, list) or len(value) < 4:
            return None
        if not all(isinstance(item, (int, float)) for item in value[:4]):
            return None
        return BoundingBox(float(value[0]), float(value[1]), float(value[2]), float(value[3]))

    @staticmethod
    def _string_at(strings: list[object], indexes: object, offset: int) -> str:
        if not isinstance(indexes, list) or offset >= len(indexes):
            return ""
        string_index = indexes[offset]
        if not isinstance(string_index, int) or not 0 <= string_index < len(strings):
            return ""
        value = strings[string_index]
        return value if isinstance(value, str) else ""

    @classmethod
    def _attributes(cls, strings: list[object], values: object, offset: int) -> dict[str, str]:
        if not isinstance(values, list) or offset >= len(values):
            return {}
        raw = values[offset]
        if not isinstance(raw, list):
            return {}
        result: dict[str, str] = {}
        for index in range(0, len(raw) - 1, 2):
            name = cls._string_index(strings, raw[index])
            value = cls._string_index(strings, raw[index + 1])
            if name:
                result[name] = value
        return result

    @staticmethod
    def _string_index(strings: list[object], index: object) -> str:
        if not isinstance(index, int) or not 0 <= index < len(strings):
            return ""
        value = strings[index]
        return value if isinstance(value, str) else ""

    @staticmethod
    def _structural_paths(parents: object, count: int) -> list[tuple[int, ...]]:
        if not isinstance(parents, list):
            return [() for _ in range(count)]
        child_offsets: dict[int, int] = {}
        sibling_index: list[int] = [0] * count
        for index in range(count):
            parent = parents[index] if index < len(parents) else -1
            if not isinstance(parent, int):
                parent = -1
            sibling_index[index] = child_offsets.get(parent, 0)
            child_offsets[parent] = sibling_index[index] + 1
        paths: list[tuple[int, ...]] = [() for _ in range(count)]
        for index in range(count):
            path: list[int] = []
            cursor = index
            visited: set[int] = set()
            while 0 <= cursor < count and cursor not in visited:
                visited.add(cursor)
                path.append(sibling_index[cursor])
                parent = parents[cursor] if cursor < len(parents) else -1
                if not isinstance(parent, int) or parent < 0:
                    break
                cursor = parent
            paths[index] = tuple(reversed(path))
        return paths
