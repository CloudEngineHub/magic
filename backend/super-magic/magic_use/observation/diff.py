from __future__ import annotations

from magic_use.models.elements import PageElements, ElementDiff, ElementNode


class ElementDiffer:
    def compare(self, previous: PageElements | None, current_nodes: tuple[ElementNode, ...]) -> ElementDiff:
        if previous is None:
            current = self._summaries(current_nodes)
            return ElementDiff(added=tuple(current[key] for key in sorted(current)))

        before = self._summaries(previous.root_nodes)
        after = self._summaries(current_nodes)
        added = tuple(after[key] for key in sorted(after.keys() - before.keys()))
        removed = tuple(before[key] for key in sorted(before.keys() - after.keys()))
        changed = tuple(
            after[key]
            for key in sorted(after.keys() & before.keys())
            if after[key] != before[key]
        )
        return ElementDiff(added=added, removed=removed, changed=changed)

    def _summaries(self, roots: tuple[ElementNode, ...]) -> dict[str, str]:
        result: dict[str, str] = {}

        def visit(node: ElementNode, path: tuple[int, ...]) -> None:
            key = node.ref or f"{path}:{node.role}:{node.name}"
            state_text = ",".join(sorted(node.states))
            result[key] = f"[{node.role}] {node.name or node.text} ({state_text})".strip()
            for index, child in enumerate(node.children):
                visit(child, (*path, index))

        for index, root in enumerate(roots):
            visit(root, (index,))
        return result
