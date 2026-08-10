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


def active_category_codes() -> set[str]:
    return {
        item["code"]
        for item in load_taxonomy().get("categories", [])
        if isinstance(item, dict) and item.get("status") == 1 and isinstance(item.get("code"), str)
    }


def tag_records_by_code() -> dict[str, dict[str, Any]]:
    return {
        item["code"]: item
        for item in load_taxonomy().get("tags", [])
        if isinstance(item, dict) and isinstance(item.get("code"), str)
    }
