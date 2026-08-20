"""Access the bundled slide template category and tag taxonomy."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any


TAXONOMY_PATH = (
    Path(__file__).resolve().parents[3]
    / "agents"
    / "skills"
    / "slide-template-maker"
    / "references"
    / "template-taxonomy.json"
)


@lru_cache(maxsize=1)
def load_taxonomy() -> dict[str, Any]:
    try:
        data = json.loads(TAXONOMY_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Bundled slide template taxonomy is unavailable: {TAXONOMY_PATH}") from exc
    if not isinstance(data, dict):
        raise RuntimeError("Bundled slide template taxonomy must be a JSON object.")
    return data


def _localized_parts(item: dict[str, Any]) -> tuple[str, str]:
    names = item.get("name_i18n") if isinstance(item.get("name_i18n"), dict) else {}
    return str(names.get("zh_CN") or ""), str(names.get("en_US") or "")


def localized_name(item: dict[str, Any]) -> str:
    return " | ".join(part for part in _localized_parts(item) if part)


def _public_named_record(item: dict[str, Any], extra: dict[str, Any] | None = None) -> dict[str, Any]:
    zh, en = _localized_parts(item)
    record = {"code": item["code"], "name_zh": zh, "name_en": en}
    if extra:
        record.update(extra)
    return record


def active_categories() -> list[dict[str, Any]]:
    return [
        _public_named_record(item)
        for item in load_taxonomy().get("categories", [])
        if isinstance(item, dict) and item.get("status") == 1 and isinstance(item.get("code"), str)
    ]


def tag_groups() -> list[dict[str, Any]]:
    counts: dict[str, int] = {}
    for item in _raw_tags():
        counts[item["group_code"]] = counts.get(item["group_code"], 0) + 1
    groups = []
    for item in load_taxonomy().get("groups", []):
        if not isinstance(item, dict) or not isinstance(item.get("code"), str):
            continue
        groups.append(_public_named_record(item, extra={"tag_count": counts.get(item["code"], 0)}))
    return groups


def group_codes() -> set[str]:
    return {item["code"] for item in tag_groups()}


def active_category_codes() -> set[str]:
    return {item["code"] for item in active_categories()}


def tag_records_by_code() -> dict[str, dict[str, Any]]:
    return {item["code"]: item for item in _raw_tags()}


def public_tag(item: dict[str, Any]) -> dict[str, Any]:
    return _public_named_record(item, extra={"group_code": item["group_code"]})


def list_tags(groups: list[str] | None = None) -> list[dict[str, Any]]:
    allowed = set(groups or [])
    return [
        public_tag(item)
        for item in _raw_tags()
        if not allowed or item["group_code"] in allowed
    ]


def search_tags(queries: list[str], groups: list[str] | None = None) -> dict[str, list[dict[str, Any]]]:
    allowed = set(groups or [])
    matches: dict[str, list[dict[str, Any]]] = {}
    for query in queries:
        needle = query.casefold().strip()
        found: list[dict[str, Any]] = []
        if needle:
            for item in _raw_tags():
                if allowed and item["group_code"] not in allowed:
                    continue
                haystack = " ".join((item["code"], localized_name(item))).casefold()
                if needle in haystack:
                    found.append(public_tag(item))
        matches[query] = found
    return matches


def format_named_line(item: dict[str, Any], extra: str = "") -> str:
    name = f"{item.get('name_zh', '')} | {item.get('name_en', '')}".strip(" |")
    suffix = f"\t{extra}" if extra else ""
    group = item.get("group_code")
    if group:
        return f"{item['code']}\t{group}\t{name}{suffix}"
    return f"{item['code']}\t{name}{suffix}"


def _raw_tags() -> list[dict[str, Any]]:
    return [
        item
        for item in load_taxonomy().get("tags", [])
        if isinstance(item, dict) and isinstance(item.get("code"), str) and isinstance(item.get("group_code"), str)
    ]
