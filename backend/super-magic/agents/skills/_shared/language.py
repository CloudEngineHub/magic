#!/usr/bin/env python3
"""Read and normalize the user's preferred language from metadata.json."""
from __future__ import annotations

import json
import os
from pathlib import Path

from _shared.bootstrap import get_project_root


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


def get_metadata_path() -> Path:
    override = os.environ.get("USER_AUTH_METADATA_PATH", "").strip()
    if override:
        return Path(override)
    return get_project_root() / ".credentials" / "metadata.json"


def get_language() -> dict[str, str]:
    language = DEFAULT_LANGUAGE
    metadata_path = get_metadata_path()

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
