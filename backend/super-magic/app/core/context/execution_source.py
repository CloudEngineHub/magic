"""Super Magic execution source policy.

The source describes who triggered the current agent run. It is a run-level
business fact, not a session setting.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Mapping, Optional

from app.core.entity.message.client_message import ChatClientMessage


EXECUTION_SOURCE_DYNAMIC_CONFIG_KEY = "super_magic_execution_source"
ASK_USER_POLICY_HORIZON_SOURCE = "ask_user_policy"


class SuperMagicExecutionSource(str, Enum):
    HUMAN_CHAT = "human_chat"
    OPEN_API = "open_api"
    MESSAGE_SCHEDULE = "message_schedule"
    WEBHOOK = "webhook"
    THIRD_PARTY_IM = "third_party_im"
    CRON = "cron"
    SYSTEM = "system"
    UNKNOWN = "unknown"

    @classmethod
    def from_raw(cls, raw: Any) -> "SuperMagicExecutionSource":
        if isinstance(raw, cls):
            return raw
        if not isinstance(raw, str):
            return cls.UNKNOWN
        normalized = raw.strip().lower()
        if not normalized:
            return cls.UNKNOWN
        for item in cls:
            if item.value == normalized:
                return item
        return cls.UNKNOWN


ASK_USER_ALLOWED_SOURCES = frozenset({SuperMagicExecutionSource.HUMAN_CHAT})


def is_ask_user_allowed_source(source: SuperMagicExecutionSource) -> bool:
    return source in ASK_USER_ALLOWED_SOURCES


def _source_from_dynamic_config(dynamic_config: Optional[Mapping[str, Any]]) -> Optional[SuperMagicExecutionSource]:
    if not isinstance(dynamic_config, Mapping):
        return None

    if EXECUTION_SOURCE_DYNAMIC_CONFIG_KEY in dynamic_config:
        return SuperMagicExecutionSource.from_raw(dynamic_config.get(EXECUTION_SOURCE_DYNAMIC_CONFIG_KEY))

    execution_context = dynamic_config.get("execution_context")
    if isinstance(execution_context, Mapping):
        if "source" in execution_context:
            return SuperMagicExecutionSource.from_raw(execution_context.get("source"))
        if "origin" in execution_context:
            return SuperMagicExecutionSource.from_raw(execution_context.get("origin"))

    return None


def resolve_execution_source(message: ChatClientMessage) -> SuperMagicExecutionSource:
    """Resolve the current run source from a chat message.

    The first phase is Python-only, while PHP entrypoints will be stamped in a
    later phase. For backward compatibility, an unmarked HTTP chat message is
    treated as human_chat. Python direct triggers such as IM and cron must stamp
    dynamic_config.super_magic_execution_source at their construction sites.
    """
    source = _source_from_dynamic_config(getattr(message, "dynamic_config", None))
    if source is not None:
        return source

    return SuperMagicExecutionSource.HUMAN_CHAT


def stamp_execution_source(message: ChatClientMessage, source: SuperMagicExecutionSource) -> None:
    dynamic_config = dict(getattr(message, "dynamic_config", None) or {})
    dynamic_config[EXECUTION_SOURCE_DYNAMIC_CONFIG_KEY] = source.value
    message.dynamic_config = dynamic_config


def remove_execution_source_from_dynamic_config(dynamic_config: Mapping[str, Any]) -> dict:
    cleaned = dict(dynamic_config or {})
    cleaned.pop(EXECUTION_SOURCE_DYNAMIC_CONFIG_KEY, None)
    return cleaned


def build_ask_user_policy_horizon_message(source: SuperMagicExecutionSource) -> str:
    return (
        f"The current execution source is {source.value}, which is not an "
        "interactive human chat context. Do not call ask_user in this run. "
        "If user confirmation or missing key information is required, do not "
        "wait for a user answer. Use a safe default when one exists, or stop "
        "the related step and explain what information the user needs to "
        "provide in an interactive human chat."
    )
