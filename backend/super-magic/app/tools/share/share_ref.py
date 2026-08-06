"""分享资源引用解析。"""

from __future__ import annotations

import re
from urllib.parse import unquote, urlparse

from .models import ShareErrorInfo, ShareServiceError, normalize_resource_id

_SHARE_PATH_PATTERN = re.compile(r"^/share/(?:files|topic)/(\d{1,64})/?$")


def parse_share_ref(share_ref: str) -> str:
    """从数字资源 ID 或完整分享 URL 中提取资源 ID。"""
    reference = share_ref.strip()
    try:
        return normalize_resource_id(reference, "invalid_share_ref")
    except ShareServiceError:
        pass

    parsed = urlparse(reference)
    if parsed.scheme not in {"http", "https"}:
        raise ShareServiceError(
            ShareErrorInfo(
                code="invalid_share_ref",
                message=(
                    "share_ref must be a numeric share resource ID (the topic ID for topic shares) "
                    "or a complete HTTP share URL."
                ),
            )
        )
    if not parsed.netloc:
        raise ShareServiceError(
            ShareErrorInfo(code="invalid_share_ref", message="The share URL is missing a host.")
        )

    match = _SHARE_PATH_PATTERN.fullmatch(unquote(parsed.path))
    if match is None:
        raise ShareServiceError(
            ShareErrorInfo(
                code="invalid_share_ref",
                message="share_ref must use a /share/files/{id} or /share/topic/{id} URL.",
            )
        )
    return match.group(1)


__all__ = ["parse_share_ref"]
