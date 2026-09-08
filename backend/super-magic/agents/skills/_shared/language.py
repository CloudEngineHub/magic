#!/usr/bin/env python3
# ruff: noqa: I001
"""Read and normalize the user's preferred language from metadata.json."""
from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path

from _shared.bootstrap import get_project_root


DEFAULT_LANGUAGE = "zh_CN"


def get_metadata_path() -> Path:
    override = os.environ.get("USER_AUTH_METADATA_PATH", "").strip()
    if override:
        return Path(override)
    return get_project_root() / ".credentials" / "metadata.json"


async def get_language() -> dict[str, str]:
    from app.utils.async_file_utils import async_try_read_json

    language = DEFAULT_LANGUAGE
    metadata_path = get_metadata_path()

    data = await async_try_read_json(metadata_path)
    if isinstance(data, dict) and isinstance(data.get("language"), str):
        language = data["language"].strip() or DEFAULT_LANGUAGE

    return {
        "language": language,
        # Compatibility alias for existing skill instructions and callers.
        "language_name": language,
        "metadata_path": str(metadata_path),
    }


if __name__ == "__main__":
    print(json.dumps(asyncio.run(get_language()), ensure_ascii=False))
