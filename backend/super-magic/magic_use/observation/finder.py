from __future__ import annotations

from difflib import SequenceMatcher
from typing import Iterable

from magic_use.models.find import FindMatch, FindQuery, FindResult
from magic_use.models.elements import ElementNode, PageElements

_ROLE_ALIASES = {
    "layouttable": "table",
    "layouttablerow": "row",
    "layouttablecell": "cell",
    "genericcontainer": "generic",
}
_TEXT_ONLY_ROLES = {"inlinetextbox", "statictext", "listmarker", "linebreak"}


def find_in_elements(elements: PageElements, query: FindQuery) -> FindResult:
    candidates = tuple(node for node in _walk(elements.root_nodes) if node.ref is not None)
    candidates = tuple(node for node in candidates if node.role.lower() not in _TEXT_ONLY_ROLES)
    if query.visible_only:
        candidates = tuple(node for node in candidates if node.visible)

    exact = tuple(node for node in candidates if _matches(node, query, ignore_role=False))
    if exact:
        return FindResult(
            page_id=elements.page_id,
            matches=tuple(_match(node) for node in exact[: query.limit]),
            truncated=len(exact) > query.limit,
        )

    relaxed = tuple(node for node in candidates if _matches(node, query, ignore_role=True))
    similar = sorted(candidates, key=lambda node: _similarity(node, query), reverse=True)[: min(5, query.limit)]
    fallback = tuple(dict.fromkeys((*relaxed, *similar)))
    names = tuple(
        dict.fromkeys(
            node.name or node.text
            for node in candidates
            if query.role is None or _normal_role(node.role) == _normal_role(query.role)
        )
    )
    return FindResult(
        page_id=elements.page_id,
        matches=tuple(_match(node) for node in fallback[: query.limit]),
        truncated=elements.truncated,
        suggestions=tuple(name for name in names if name),
    )


def _walk(nodes: Iterable[ElementNode]) -> Iterable[ElementNode]:
    for node in nodes:
        yield node
        yield from _walk(node.children)


def _matches(node: ElementNode, query: FindQuery, *, ignore_role: bool) -> bool:
    if not ignore_role and query.role and _normal_role(node.role) != _normal_role(query.role):
        return False
    if query.name and _normal_text(query.name) not in _normal_text(node.name):
        return False
    if query.text and _normal_text(query.text) not in _normal_text(node.text):
        return False
    return True


def _similarity(node: ElementNode, query: FindQuery) -> float:
    expected = _normal_text(query.name or query.text or "")
    actual = _normal_text(f"{node.name} {node.text}")
    return SequenceMatcher(None, expected, actual).ratio()


def _normal_role(value: str) -> str:
    normalized = value.strip().lower()
    return _ROLE_ALIASES.get(normalized, normalized)


def _normal_text(value: str) -> str:
    return " ".join(value.casefold().split())


def _match(node: ElementNode) -> FindMatch:
    return FindMatch(
        ref=node.ref or "",
        role=node.role,
        name=node.name,
        text=node.text,
        actions=node.actions,
        bounding_box=node.bounding_box,
        in_viewport=node.in_viewport,
    )
