from __future__ import annotations

import re

from magic_use.userscripts.model import Userscript, UserscriptRunAt

_METADATA_BLOCK = re.compile(r"//\s*==UserScript==\s*(.*?)\s*//\s*==/UserScript==", re.DOTALL)
_METADATA_LINE = re.compile(r"^//\s*@(?P<key>\S+)\s+(?P<value>.*\S)\s*$")


def parse_userscript(source: str, *, fallback_name: str) -> Userscript:
    metadata_block = _METADATA_BLOCK.search(source)
    if metadata_block is None:
        raise ValueError("Userscript metadata block is missing")

    scalar: dict[str, str] = {}
    matches: list[str] = []
    excludes: list[str] = []
    for raw_line in metadata_block.group(1).splitlines():
        line = _METADATA_LINE.match(raw_line.strip())
        if line is None:
            continue
        key = line.group("key").lower()
        value = line.group("value").strip()
        if key == "match":
            matches.append(value)
        elif key == "exclude":
            excludes.append(value)
        elif key in {"name", "version", "description", "run-at"}:
            scalar[key] = value

    raw_run_at = scalar.get("run-at", UserscriptRunAt.DOCUMENT_END.value)
    try:
        run_at = UserscriptRunAt(raw_run_at)
    except ValueError as error:
        raise ValueError(f"Unsupported userscript @run-at value: {raw_run_at}") from error

    script_body = source[metadata_block.end() :].strip()
    return Userscript(
        name=scalar.get("name", fallback_name),
        version=scalar.get("version"),
        description=scalar.get("description"),
        source=script_body,
        match_patterns=tuple(matches),
        exclude_patterns=tuple(excludes),
        run_at=run_at,
    )
