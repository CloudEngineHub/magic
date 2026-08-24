#!/usr/bin/env python3
"""Read the user's preferred language without depending on the current directory."""
from __future__ import annotations

import json
import sys
import os
from pathlib import Path

DEFAULT_LANGUAGE = "zh_CN"
LANGUAGE_LABELS = {
    "zh": "Chinese",
    "zh_cn": "Chinese",
    "zh_tw": "Chinese",
    "zh_hk": "Chinese",
    "en": "English",
    "en_us": "English",
    "en_gb": "English",
}


def _find_project_root() -> Path:
    current = Path(__file__).resolve()
    for parent in current.parents:
        if (parent / ".super-magic-project-root").exists():
            return parent
    raise RuntimeError("Cannot locate project root (.super-magic-project-root not found)")


def get_metadata_path() -> Path:
    override = os.environ.get("USER_AUTH_METADATA_PATH", "").strip()
    if override:
        return Path(override)
    return _find_project_root() / ".credentials" / "metadata.json"


def get_language() -> dict[str, str]:
    metadata_path = get_metadata_path()
    language = DEFAULT_LANGUAGE
    try:
        data = json.loads(metadata_path.read_text(encoding="utf-8"))
        if isinstance(data, dict) and isinstance(data.get("language"), str):
            language = data["language"].strip() or DEFAULT_LANGUAGE
    except (OSError, json.JSONDecodeError):
        pass

    normalized = language.lower().replace("-", "_")
    return {
        "language": language,
        "language_name": LANGUAGE_LABELS.get(normalized, language),
        "metadata_path": str(metadata_path),
    }


if __name__ == "__main__":
    print(json.dumps(get_language(), ensure_ascii=False))