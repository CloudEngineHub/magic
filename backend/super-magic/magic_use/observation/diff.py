from __future__ import annotations

from magic_use.models.snapshot import PageSnapshot, SnapshotDiff, SnapshotNode


class SnapshotDiffer:
    def compare(self, previous: PageSnapshot | None, current_nodes: tuple[SnapshotNode, ...]) -> SnapshotDiff:
        if previous is None:
            current = self._summaries(current_nodes)
            return SnapshotDiff(added=tuple(current[key] for key in sorted(current)))

        before = self._summaries(previous.root_nodes)
        after = self._summaries(current_nodes)
        added = tuple(after[key] for key in sorted(after.keys() - before.keys()))
        removed = tuple(before[key] for key in sorted(before.keys() - after.keys()))
        changed = tuple(
            after[key]
            for key in sorted(after.keys() & before.keys())
            if after[key] != before[key]
        )
        return SnapshotDiff(added=added, removed=removed, changed=changed)

    def _summaries(self, roots: tuple[SnapshotNode, ...]) -> dict[str, str]:
        result: dict[str, str] = {}

        def visit(node: SnapshotNode, path: tuple[int, ...]) -> None:
            key = node.ref or f"{path}:{node.role}:{node.name}"
            state_text = ",".join(sorted(node.states))
            result[key] = f"[{node.role}] {node.name or node.text} ({state_text})".strip()
            for index, child in enumerate(node.children):
                visit(child, (*path, index))

        for index, root in enumerate(roots):
            visit(root, (index,))
        return result
