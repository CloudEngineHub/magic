"""构建分享工具展示用的可直接访问链接。"""

from __future__ import annotations

from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from .models import AccessType


def build_share_access_url(share_url: str, access_type: AccessType | str, password: str | None) -> str:
    """在已知密码分享的服务端链接上安全添加唯一 password 参数。"""
    if access_type != "password" or not password or not share_url:
        return share_url
    parts = urlsplit(share_url)
    query = [(key, value) for key, value in parse_qsl(parts.query, keep_blank_values=True) if key != "password"]
    query.append(("password", password))
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


__all__ = ["build_share_access_url"]
