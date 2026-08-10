"""按 AgentContext 隔离 Browser client 和 session 生命周期。"""

from __future__ import annotations

from dataclasses import dataclass

from magic_use import BrowserClient
from magic_use.models import BrowserSession


@dataclass(slots=True)
class BrowserRuntimeEntry:
    client: BrowserClient
    session: BrowserSession
    is_default: bool


class BrowserRuntimeRegistry:
    """主事件循环内使用的 Browser runtime 注册表。"""

    _instance: "BrowserRuntimeRegistry | None" = None

    def __init__(self) -> None:
        self._entries: dict[str, dict[str, BrowserRuntimeEntry]] = {}

    @classmethod
    def get_instance(cls) -> "BrowserRuntimeRegistry":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def register(self, context_id: str, entry: BrowserRuntimeEntry) -> None:
        sessions = self._entries.setdefault(context_id, {})
        if entry.is_default:
            for current in sessions.values():
                current.is_default = False
        sessions[entry.session.id] = entry

    def get(self, context_id: str, session_id: str) -> BrowserRuntimeEntry | None:
        return self._entries.get(context_id, {}).get(session_id)

    def get_default(self, context_id: str) -> BrowserRuntimeEntry | None:
        for entry in self._entries.get(context_id, {}).values():
            if entry.is_default:
                return entry
        return None

    def list(self, context_id: str) -> tuple[BrowserRuntimeEntry, ...]:
        return tuple(self._entries.get(context_id, {}).values())

    def remove(self, context_id: str, session_id: str) -> BrowserRuntimeEntry | None:
        sessions = self._entries.get(context_id)
        if sessions is None:
            return None
        entry = sessions.pop(session_id, None)
        if not sessions:
            self._entries.pop(context_id, None)
        return entry

    def remove_all(self, context_id: str) -> tuple[BrowserRuntimeEntry, ...]:
        return tuple(self._entries.pop(context_id, {}).values())
