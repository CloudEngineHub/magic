from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Mapping, Protocol


@dataclass(frozen=True, slots=True)
class TunnelLease:
    id: str
    endpoint: str
    expires_at: datetime | None
    metadata: Mapping[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.endpoint.startswith(("ws://", "wss://")):
            raise ValueError("Tunnel endpoint must use ws:// or wss://")


class TunnelProvider(Protocol):
    async def open(self, *, local_host: str, local_port: int) -> TunnelLease: ...

    async def close(self, lease_id: str) -> None: ...
