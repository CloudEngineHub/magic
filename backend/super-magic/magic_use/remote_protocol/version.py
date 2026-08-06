from __future__ import annotations

from magic_use.errors import BrowserConnectionError

PROTOCOL_VERSION = "1.0"
SUPPORTED_PROTOCOL_VERSIONS = (PROTOCOL_VERSION,)


def negotiate_version(peer_versions: tuple[str, ...]) -> str:
    for version in SUPPORTED_PROTOCOL_VERSIONS:
        if version in peer_versions:
            return version
    offered = ", ".join(peer_versions) if peer_versions else "none"
    raise BrowserConnectionError(
        f"Chrome extension protocol version is incompatible; peer offered: {offered}",
        version_mismatch=True,
    )
