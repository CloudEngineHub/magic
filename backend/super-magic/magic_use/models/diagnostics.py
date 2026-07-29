from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum


class WaitConditionKind(str, Enum):
    TIME = "time"
    URL = "url"
    LOAD_STATE = "load_state"
    TEXT = "text"
    REF = "ref"
    DOWNLOAD = "download"


@dataclass(frozen=True, slots=True)
class WaitRequest:
    condition: WaitConditionKind
    timeout_ms: float = 30_000
    value: str | None = None
    duration_ms: float | None = None
    state: str | None = None

    def __post_init__(self) -> None:
        if self.timeout_ms <= 0:
            raise ValueError("timeout_ms must be greater than zero")

        if self.condition is WaitConditionKind.TIME:
            if self.duration_ms is None or self.duration_ms <= 0:
                raise ValueError("duration_ms must be greater than zero for a time wait")
            if self.value is not None or self.state is not None:
                raise ValueError("time waits do not accept value or state")
            return

        if self.duration_ms is not None:
            raise ValueError("duration_ms is only valid for a time wait")
        if self.condition in {WaitConditionKind.URL, WaitConditionKind.TEXT, WaitConditionKind.REF}:
            if self.value is None or not self.value:
                raise ValueError(f"value is required for a {self.condition.value} wait")

        if self.condition is WaitConditionKind.LOAD_STATE:
            if self.state not in {"commit", "domcontentloaded", "load", "networkidle"}:
                raise ValueError("load_state waits require state: commit, domcontentloaded, load, or networkidle")
        elif self.condition is WaitConditionKind.TEXT:
            if self.state is not None and self.state not in {"attached", "detached", "visible", "hidden"}:
                raise ValueError("text wait state must be attached, detached, visible, or hidden")
        elif self.condition is WaitConditionKind.REF:
            if self.state is not None and self.state not in {
                "attached",
                "detached",
                "visible",
                "hidden",
                "enabled",
                "disabled",
            }:
                raise ValueError(
                    "ref wait state must be attached, detached, visible, hidden, enabled, or disabled"
                )
        elif self.state is not None:
            raise ValueError(f"state is not valid for a {self.condition.value} wait")


@dataclass(frozen=True, slots=True)
class ConsoleEntry:
    page_id: str
    level: str
    text: str
    occurred_at: datetime


@dataclass(frozen=True, slots=True)
class NetworkEntry:
    page_id: str
    phase: str
    method: str
    url: str
    status: int | None
    error: str | None
    occurred_at: datetime
