from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import uuid4

from magic_use.interaction.ref_registry import RefRegistry
from magic_use.models.common import SnapshotScope
from magic_use.models.geometry import BoundingBox, Viewport
from magic_use.models.refs import ElementRefRecord
from magic_use.models.snapshot import PageSnapshot, SnapshotNode, SnapshotOptions
from magic_use.observation.diff import SnapshotDiffer
from magic_use.observation.sources import (
    AccessibilityNodeSource,
    DOMNodeSource,
    ProbeNodeSource,
    SnapshotSources,
)

_REF_ATTRIBUTE_NAMES = {"id", "name", "aria-label", "data-testid", "type"}


@dataclass(slots=True)
class _NodeDraft:
    ax: AccessibilityNodeSource
    dom: DOMNodeSource | None
    probe: ProbeNodeSource | None
    children: list["_NodeDraft"]
    structural_path: tuple[int, ...]
    frame_id: str


class SnapshotComposer:
    def __init__(self, refs: RefRegistry, differ: SnapshotDiffer | None = None) -> None:
        self._refs = refs
        self._differ = differ or SnapshotDiffer()

    def compose(
        self,
        *,
        session_id: str,
        page_id: str,
        document_generation: int,
        url: str,
        title: str,
        sources: SnapshotSources,
        options: SnapshotOptions,
        previous: PageSnapshot | None,
        projection_scope: SnapshotScope | None = None,
    ) -> PageSnapshot:
        self._refs.clear_stale_generations(page_id, document_generation)
        snapshot_id = uuid4().hex
        effective_scope = projection_scope or options.scope
        drafts = self._build_tree(sources)
        if effective_scope is SnapshotScope.SUBTREE and options.root_ref is not None:
            root_record = self._refs.resolve(
                options.root_ref,
                page_id=page_id,
                document_generation=document_generation,
            )
            drafts = tuple(
                draft
                for draft in self._walk_drafts(drafts)
                if draft.dom is not None and draft.dom.backend_node_id == root_record.backend_node_id
            )

        state = _ComposeState(max_nodes=options.max_nodes, max_depth=options.max_depth)
        relevant_draft_ids = self._collect_relevant_draft_ids(
            drafts,
            scope=effective_scope,
            viewport=sources.viewport,
        )
        nodes: list[SnapshotNode] = []
        records: list[ElementRefRecord] = []
        for draft in drafts:
            composed = self._compose_node(
                draft=draft,
                depth=0,
                state=state,
                relevant_draft_ids=relevant_draft_ids,
                scope=effective_scope,
                snapshot_id=snapshot_id,
                session_id=session_id,
                page_id=page_id,
                generation=document_generation,
                records=records,
                viewport=sources.viewport,
            )
            if composed is not None:
                nodes.append(composed)
            if state.count >= state.max_nodes:
                break

        node_tuple = tuple(nodes)
        diff = self._differ.compare(previous, node_tuple) if options.scope is SnapshotScope.CHANGES else None
        return PageSnapshot(
            id=snapshot_id,
            session_id=session_id,
            page_id=page_id,
            document_generation=document_generation,
            scope=options.scope,
            url=url,
            title=title,
            viewport=sources.viewport,
            root_nodes=node_tuple,
            refs=tuple(records),
            truncated=state.truncated,
            created_at=datetime.now(timezone.utc),
            diff=diff,
        )

    def _build_tree(self, sources: SnapshotSources) -> tuple[_NodeDraft, ...]:
        dom_by_backend = {node.backend_node_id: node for node in sources.dom}
        probe_by_dom = self._match_probes(sources.dom, sources.probe, sources.viewport.scroll_x, sources.viewport.scroll_y)
        drafts: dict[str, _NodeDraft] = {}
        draft_by_backend: dict[int, _NodeDraft] = {}
        for ax in sources.accessibility:
            if ax.ignored:
                continue
            dom = dom_by_backend.get(ax.backend_node_id) if ax.backend_node_id is not None else None
            draft = _NodeDraft(
                ax=ax,
                dom=dom,
                probe=probe_by_dom.get(dom.backend_node_id) if dom is not None else None,
                children=[],
                structural_path=dom.structural_path if dom is not None else (),
                frame_id=ax.frame_id,
            )
            drafts[ax.node_id] = draft
            if ax.backend_node_id is not None:
                draft_by_backend[ax.backend_node_id] = draft

        roots: list[_NodeDraft] = []
        for draft in drafts.values():
            parent = drafts.get(draft.ax.parent_node_id or "")
            if parent is None:
                roots.append(draft)
            else:
                parent.children.append(draft)

        dom_by_backend = {node.backend_node_id: node for node in sources.dom}
        for backend_node_id, probe in probe_by_dom.items():
            if backend_node_id in draft_by_backend or not probe.actions:
                continue
            dom = dom_by_backend[backend_node_id]
            synthetic_ax = AccessibilityNodeSource(
                node_id=f"probe:{backend_node_id}",
                parent_node_id=None,
                child_node_ids=(),
                backend_node_id=backend_node_id,
                frame_id="",
                role=probe.role,
                name=probe.name,
                description="",
                value="",
                properties={},
                ignored=False,
            )
            synthetic = _NodeDraft(
                ax=synthetic_ax,
                dom=dom,
                probe=probe,
                children=[],
                structural_path=dom.structural_path,
                frame_id="",
            )
            parent = self._nearest_parent_draft(dom, dom_by_backend, draft_by_backend)
            if parent is None:
                roots.append(synthetic)
            else:
                parent.children.append(synthetic)
            draft_by_backend[backend_node_id] = synthetic
        for root in roots:
            self._inherit_frame_id(root, "")
        return tuple(roots)

    @staticmethod
    def _nearest_parent_draft(
        node: DOMNodeSource,
        dom_by_backend: dict[int, DOMNodeSource],
        draft_by_backend: dict[int, _NodeDraft],
    ) -> _NodeDraft | None:
        parent_id = node.parent_backend_node_id
        visited: set[int] = set()
        while parent_id is not None and parent_id not in visited:
            visited.add(parent_id)
            draft = draft_by_backend.get(parent_id)
            if draft is not None:
                return draft
            parent = dom_by_backend.get(parent_id)
            parent_id = parent.parent_backend_node_id if parent is not None else None
        return None

    def _compose_node(
        self,
        *,
        draft: _NodeDraft,
        depth: int,
        state: "_ComposeState",
        relevant_draft_ids: set[int],
        scope: SnapshotScope,
        snapshot_id: str,
        session_id: str,
        page_id: str,
        generation: int,
        records: list[ElementRefRecord],
        viewport: Viewport,
    ) -> SnapshotNode | None:
        if id(draft) not in relevant_draft_ids:
            return None
        if state.count >= state.max_nodes or draft.ax is None:
            state.truncated = True
            return None
        if depth > state.max_depth:
            state.truncated = True
            return None

        role = draft.ax.role or (draft.probe.role if draft.probe is not None else "generic")
        name = draft.ax.name or (draft.probe.name if draft.probe is not None else "")
        rect = (
            self._to_viewport_rect(draft.dom.bounding_box, viewport)
            if draft.dom is not None
            else None
        )
        if draft.probe is not None and draft.probe.bounding_box is not None:
            rect = draft.probe.bounding_box
        actions = self._actions(role, draft.probe)
        ref_attributes = self._ref_attributes(draft.dom.attributes) if draft.dom is not None else {}
        states = self._states(draft.ax, draft.probe)
        visible = draft.probe.visible if draft.probe is not None else rect is not None
        in_viewport = draft.probe.in_viewport if draft.probe is not None else self._in_viewport(rect, viewport)
        occluded = draft.probe.occluded if draft.probe is not None else False
        include_self = self._include(
            scope=scope,
            role=role,
            actions=actions,
            visible=visible,
            in_viewport=in_viewport,
        )
        state.count += 1
        ref: str | None = None
        if include_self and actions and draft.dom is not None:
            record = self._refs.register(
                ElementRefRecord(
                    ref="",
                    snapshot_id=snapshot_id,
                    session_id=session_id,
                    page_id=page_id,
                    document_generation=generation,
                    frame_id=draft.frame_id,
                    backend_node_id=draft.dom.backend_node_id,
                    object_id=None,
                    role=role,
                    accessible_name=name,
                    text=draft.dom.node_value,
                    attributes=ref_attributes,
                    structural_path=draft.structural_path,
                    bounding_box=rect,
                    stable_fingerprint=RefRegistry.fingerprint(
                        role=role,
                        name=name,
                        frame_id=draft.frame_id,
                        attributes=ref_attributes,
                        structural_path=draft.structural_path,
                    ),
                )
            )
            ref = record.ref
            records.append(record)

        children: list[SnapshotNode] = []
        if depth == state.max_depth:
            if any(id(child) in relevant_draft_ids for child in draft.children):
                state.truncated = True
        else:
            for child in draft.children:
                composed_child = self._compose_node(
                    draft=child,
                    depth=depth + 1,
                    state=state,
                    relevant_draft_ids=relevant_draft_ids,
                    scope=scope,
                    snapshot_id=snapshot_id,
                    session_id=session_id,
                    page_id=page_id,
                    generation=generation,
                    records=records,
                    viewport=viewport,
                )
                if composed_child is not None:
                    children.append(composed_child)
                if state.count >= state.max_nodes:
                    break

        return SnapshotNode(
            ref=ref,
            role=role,
            name=name,
            description=draft.ax.description,
            text=draft.dom.node_value if draft.dom is not None else "",
            value=self._safe_value(draft.ax.value, role=role, attributes=ref_attributes),
            states=states,
            actions=actions,
            visible=visible,
            in_viewport=in_viewport,
            occluded=occluded,
            bounding_box=rect,
            frame_id=draft.frame_id,
            depth=depth,
            children=tuple(children),
        )

    def _collect_relevant_draft_ids(
        self,
        roots: tuple[_NodeDraft, ...],
        *,
        scope: SnapshotScope,
        viewport: Viewport,
    ) -> set[int]:
        relevant: set[int] = set()

        def visit(draft: _NodeDraft) -> bool:
            included = self._draft_is_included(draft, scope=scope, viewport=viewport)
            for child in draft.children:
                if visit(child):
                    included = True
            if included:
                relevant.add(id(draft))
            return included

        for root in roots:
            visit(root)
        return relevant

    def _draft_is_included(
        self,
        draft: _NodeDraft,
        *,
        scope: SnapshotScope,
        viewport: Viewport,
    ) -> bool:
        role = draft.ax.role or (draft.probe.role if draft.probe is not None else "generic")
        rect = draft.probe.bounding_box if draft.probe is not None else (
            self._to_viewport_rect(draft.dom.bounding_box, viewport)
            if draft.dom is not None
            else None
        )
        actions = self._actions(role, draft.probe)
        visible = draft.probe.visible if draft.probe is not None else rect is not None
        in_viewport = draft.probe.in_viewport if draft.probe is not None else self._in_viewport(rect, viewport)
        return self._include(
            scope=scope,
            role=role,
            actions=actions,
            visible=visible,
            in_viewport=in_viewport,
        )

    @staticmethod
    def _actions(role: str, probe: ProbeNodeSource | None) -> frozenset[str]:
        actions = set(probe.actions if probe is not None else ())
        if role in {"button", "link", "menuitem", "option", "radio", "tab", "treeitem"}:
            actions.add("click")
        if role in {"textbox", "searchbox", "spinbutton"}:
            actions.update({"click", "fill", "press"})
        if role in {"checkbox", "switch"}:
            actions.update({"click", "check"})
        if role in {"combobox", "listbox"}:
            actions.update({"click", "select"})
        return frozenset(actions)

    @staticmethod
    def _ref_attributes(attributes: dict[str, str]) -> dict[str, str]:
        """只保留定位需要的稳定属性，避免把表单值和页面私有数据放进快照。"""
        return {
            name: value
            for name, value in attributes.items()
            if name in _REF_ATTRIBUTE_NAMES and value
        }

    @staticmethod
    def _safe_value(value: str, *, role: str, attributes: dict[str, str]) -> str:
        if role in {"textbox", "searchbox"} and attributes.get("type", "").lower() == "password":
            return "[redacted]" if value else ""
        return value

    @staticmethod
    def _states(ax: AccessibilityNodeSource, probe: ProbeNodeSource | None) -> frozenset[str]:
        states = set(probe.states if probe is not None else ())
        for name, value in ax.properties.items():
            if value is True:
                states.add(name)
            elif value not in (False, "", None):
                states.add(f"{name}={value}")
        return frozenset(states)

    @staticmethod
    def _include(
        *,
        scope: SnapshotScope,
        role: str,
        actions: frozenset[str],
        visible: bool,
        in_viewport: bool,
    ) -> bool:
        if scope in {SnapshotScope.FULL, SnapshotScope.SUBTREE, SnapshotScope.CHANGES}:
            return True
        if scope is SnapshotScope.VIEWPORT:
            return visible and in_viewport
        return visible and bool(actions)

    @staticmethod
    def _in_viewport(rect: BoundingBox | None, viewport: Viewport) -> bool:
        return (
            rect is not None
            and rect.width > 0
            and rect.height > 0
            and rect.intersects(BoundingBox(0, 0, viewport.width, viewport.height))
        )

    @staticmethod
    def _to_viewport_rect(rect: BoundingBox | None, viewport: Viewport) -> BoundingBox | None:
        if rect is None:
            return None
        return BoundingBox(
            x=rect.x - viewport.scroll_x,
            y=rect.y - viewport.scroll_y,
            width=rect.width,
            height=rect.height,
        )

    @staticmethod
    def _match_probes(
        dom_nodes: tuple[DOMNodeSource, ...],
        probes: tuple[ProbeNodeSource, ...],
        scroll_x: float,
        scroll_y: float,
    ) -> dict[int, ProbeNodeSource]:
        matches: dict[int, ProbeNodeSource] = {}
        unused_dom = {node.backend_node_id: node for node in dom_nodes}
        for probe in probes:
            candidates = tuple(
                dom
                for dom in unused_dom.values()
                if dom.node_name == probe.tag and SnapshotComposer._identity_matches(dom, probe)
            )
            if len(candidates) == 1:
                matched = candidates[0]
                matches[matched.backend_node_id] = probe
                unused_dom.pop(matched.backend_node_id, None)

        for probe in probes:
            if probe in matches.values():
                continue
            path_candidates = tuple(
                dom
                for dom in unused_dom.values()
                if dom.node_name == probe.tag
                and probe.structural_path
                and SnapshotComposer._path_suffix_matches(dom.structural_path, probe.structural_path)
            )
            if len(path_candidates) == 1:
                matched = path_candidates[0]
                matches[matched.backend_node_id] = probe
                unused_dom.pop(matched.backend_node_id, None)

        for probe in probes:
            if probe in matches.values() or probe.bounding_box is None:
                continue
            best_dom: DOMNodeSource | None = None
            best_score = 0.0
            document_rect = BoundingBox(
                x=probe.bounding_box.x + scroll_x,
                y=probe.bounding_box.y + scroll_y,
                width=probe.bounding_box.width,
                height=probe.bounding_box.height,
            )
            for dom in unused_dom.values():
                if dom.bounding_box is None or dom.node_name != probe.tag:
                    continue
                score = SnapshotComposer._rect_similarity(dom.bounding_box, document_rect)
                if score > best_score:
                    best_score = score
                    best_dom = dom
            if best_dom is not None and best_score >= 0.8:
                matches[best_dom.backend_node_id] = probe
                unused_dom.pop(best_dom.backend_node_id, None)
        return matches

    @staticmethod
    def _identity_matches(dom: DOMNodeSource, probe: ProbeNodeSource) -> bool:
        for name in ("id", "data-testid"):
            value = probe.attributes.get(name)
            if value and dom.attributes.get(name) == value:
                return True
        probe_name = probe.attributes.get("name")
        probe_type = probe.attributes.get("type")
        return bool(
            probe_name
            and dom.attributes.get("name") == probe_name
            and (not probe_type or dom.attributes.get("type") == probe_type)
        )

    @staticmethod
    def _path_suffix_matches(dom_path: tuple[int, ...], probe_path: tuple[int, ...]) -> bool:
        return len(dom_path) >= len(probe_path) and dom_path[-len(probe_path) :] == probe_path

    @staticmethod
    def _rect_similarity(left: BoundingBox, right: BoundingBox) -> float:
        if not left.intersects(right):
            return 0.0
        intersection_width = min(left.x + left.width, right.x + right.width) - max(left.x, right.x)
        intersection_height = min(left.y + left.height, right.y + right.height) - max(left.y, right.y)
        intersection = max(0.0, intersection_width) * max(0.0, intersection_height)
        union = left.area + right.area - intersection
        return intersection / union if union > 0 else 0.0

    @staticmethod
    def _walk_drafts(roots: tuple[_NodeDraft, ...]) -> tuple[_NodeDraft, ...]:
        result: list[_NodeDraft] = []

        def visit(node: _NodeDraft) -> None:
            result.append(node)
            for child in node.children:
                visit(child)

        for root in roots:
            visit(root)
        return tuple(result)

    @staticmethod
    def _inherit_frame_id(node: _NodeDraft, parent_frame_id: str) -> None:
        if not node.frame_id:
            node.frame_id = parent_frame_id
        for child in node.children:
            SnapshotComposer._inherit_frame_id(child, node.frame_id)


@dataclass(slots=True)
class _ComposeState:
    max_nodes: int
    max_depth: int
    count: int = 0
    truncated: bool = False
