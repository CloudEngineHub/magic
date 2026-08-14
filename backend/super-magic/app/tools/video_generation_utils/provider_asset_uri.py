"""视频供应商素材 URI 识别工具。"""

from __future__ import annotations

import re

_PROVIDER_ASSET_URI_PATTERN = re.compile(r"^asset://[A-Za-z0-9][A-Za-z0-9._-]*$")


def is_provider_asset_uri(value: str) -> bool:
    """判断字符串是否为受控的供应商素材 URI。"""
    return _PROVIDER_ASSET_URI_PATTERN.fullmatch(str(value or "").strip()) is not None


__all__ = ["is_provider_asset_uri"]
