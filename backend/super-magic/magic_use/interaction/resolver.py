from __future__ import annotations

from dataclasses import dataclass

from magic_use.errors import AmbiguousRefError, StaleRefError
from magic_use.interaction.ref_registry import RefRegistry
from magic_use.models.refs import ElementRefRecord
from magic_use.observation.sources import AccessibilityNodeSource, DOMNodeSource


@dataclass(frozen=True, slots=True)
class ResolvedRef:
    record: ElementRefRecord
    backend_node_id: int


class RefResolver:
    def __init__(self, registry: RefRegistry) -> None:
        self._registry = registry

    def resolve(
        self,
        ref: str,
        *,
        page_id: str,
        document_generation: int,
        dom_nodes: tuple[DOMNodeSource, ...],
        accessibility_nodes: tuple[AccessibilityNodeSource, ...] = (),
    ) -> ResolvedRef:
        record = self._registry.resolve(
            ref,
            page_id=page_id,
            document_generation=document_generation,
        )
        by_backend_id = {node.backend_node_id: node for node in dom_nodes}
        if record.backend_node_id is not None and record.backend_node_id in by_backend_id:
            return ResolvedRef(record=record, backend_node_id=record.backend_node_id)

        had_ambiguous_candidates = False
        candidates = [
            node
            for node in dom_nodes
            if RefRegistry.fingerprint(
                role=record.role,
                name=record.accessible_name,
                frame_id=record.frame_id,
                attributes=dict(node.attributes),
                structural_path=node.structural_path,
            )
            == record.stable_fingerprint
        ]
        if len(candidates) == 1:
            return ResolvedRef(record=record, backend_node_id=candidates[0].backend_node_id)
        had_ambiguous_candidates = had_ambiguous_candidates or len(candidates) > 1

        ax_candidates = {
            node.backend_node_id
            for node in accessibility_nodes
            if node.backend_node_id is not None
            and node.role == record.role
            and node.name == record.accessible_name
            and node.frame_id == record.frame_id
        }
        if len(ax_candidates) == 1:
            return ResolvedRef(record=record, backend_node_id=ax_candidates.pop())
        had_ambiguous_candidates = had_ambiguous_candidates or len(ax_candidates) > 1

        stable_attributes = {
            key: value
            for key, value in record.attributes.items()
            if key in {"id", "name", "aria-label", "data-testid"} and value
        }
        if stable_attributes:
            attribute_candidates = [
                node
                for node in dom_nodes
                if all(node.attributes.get(key) == value for key, value in stable_attributes.items())
            ]
            if len(attribute_candidates) == 1:
                return ResolvedRef(record=record, backend_node_id=attribute_candidates[0].backend_node_id)
            had_ambiguous_candidates = had_ambiguous_candidates or len(attribute_candidates) > 1

        path_candidates = [node for node in dom_nodes if node.structural_path == record.structural_path]
        if len(path_candidates) == 1:
            return ResolvedRef(record=record, backend_node_id=path_candidates[0].backend_node_id)
        if had_ambiguous_candidates or len(path_candidates) > 1:
            raise AmbiguousRefError(ref)
        raise StaleRefError(ref)
