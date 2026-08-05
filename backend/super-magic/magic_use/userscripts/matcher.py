from __future__ import annotations

import re
from functools import lru_cache
from urllib.parse import urlsplit

_MATCH_PATTERN = re.compile(r"^(?P<scheme>\*|http|https|file|ftp)://(?P<host>[^/]*)(?P<path>/.*)$")


def matches_url(url: str, patterns: tuple[str, ...], excludes: tuple[str, ...] = ()) -> bool:
    return any(_matches_pattern(url, pattern) for pattern in patterns) and not any(
        _matches_pattern(url, pattern) for pattern in excludes
    )


@lru_cache(maxsize=512)
def _compile_pattern(pattern: str) -> re.Pattern[str]:
    if pattern == "<all_urls>":
        return re.compile(r"^(?:http|https|file|ftp)://")

    match = _MATCH_PATTERN.fullmatch(pattern)
    if match is None:
        raise ValueError(f"Invalid userscript match pattern: {pattern}")

    scheme = match.group("scheme")
    host = match.group("host")
    path = match.group("path")
    scheme_expression = r"https?" if scheme == "*" else re.escape(scheme)
    if host == "*":
        host_expression = r"[^/:]+"
    elif host.startswith("*."):
        base_host = re.escape(host[2:])
        host_expression = rf"(?:[^/:]+\.)?{base_host}"
    else:
        host_expression = re.escape(host)
    if scheme != "file":
        host_expression += r"(?::\d+)?"
    path_expression = re.escape(path).replace(r"\*", ".*")
    return re.compile(rf"^{scheme_expression}://{host_expression}{path_expression}$")


def _matches_pattern(url: str, pattern: str) -> bool:
    if not url or urlsplit(url).scheme not in {"http", "https", "file", "ftp"}:
        return False
    return _compile_pattern(pattern).fullmatch(url) is not None
