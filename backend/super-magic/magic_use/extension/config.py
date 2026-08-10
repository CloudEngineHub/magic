from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ChromeExtensionConfig:
    relay_host: str = "127.0.0.1"
    relay_port: int = 0
    pairing_ttl_seconds: float = 300.0
    session_lease_ttl_seconds: float = 1_800.0
    heartbeat_interval_seconds: float = 20.0
    reconnect_grace_period_seconds: float = 60.0
    request_timeout_seconds: float = 120.0
    max_message_bytes: int = 4 * 1024 * 1024
    max_binary_chunk_bytes: int = 1024 * 1024
    max_binary_transfer_bytes: int = 64 * 1024 * 1024
    max_pending_requests: int = 32
    max_event_buffer_size: int = 1_000

    def __post_init__(self) -> None:
        if not self.relay_host:
            raise ValueError("relay_host must not be empty")
        if not 0 <= self.relay_port <= 65_535:
            raise ValueError("relay_port must be between 0 and 65535")
        if min(
            self.pairing_ttl_seconds,
            self.session_lease_ttl_seconds,
            self.heartbeat_interval_seconds,
            self.reconnect_grace_period_seconds,
            self.request_timeout_seconds,
        ) <= 0:
            raise ValueError("Chrome extension timeouts must be positive")
        if min(
            self.max_message_bytes,
            self.max_binary_chunk_bytes,
            self.max_binary_transfer_bytes,
            self.max_pending_requests,
            self.max_event_buffer_size,
        ) < 1:
            raise ValueError("Chrome extension size and concurrency limits must be positive")
        if self.max_binary_transfer_bytes < self.max_binary_chunk_bytes:
            raise ValueError("max_binary_transfer_bytes must not be smaller than one chunk")
