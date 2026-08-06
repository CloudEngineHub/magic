"""可重启 Agent 会话的稳定引用。"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Mapping

from app.core.models.agent_runtime import AgentProviderType, AgentTarget


@dataclass(frozen=True, slots=True)
class AgentSessionRef:
    """唯一定位一份可持久化 Agent 会话。

    这不是进程内的 Agent 对象，也不是一个可以继续执行的运行句柄，而是“下次启动
    Agent 时去哪里读取上下文”的稳定地址：

        AgentSessionRef
        ├─ target.provider_type + target.agent_name  -> 用哪一种 Agent、哪个 Agent
        ├─ agent_id                                  -> 哪一条独立会话
        └─ chat_history_dir                          -> 从哪个目录读取三份上下文文件

    例如 `magic<research-2>` 和 `openclaw<research-2>` 不是同一个运行目标；完整的
    target 和目录必须一起保存，不能只保存一个容易重名的 agent_id。
    """

    target: AgentTarget
    agent_id: str
    chat_history_dir: Path

    def __post_init__(self) -> None:
        if not isinstance(self.target, AgentTarget):
            raise TypeError("target must be an AgentTarget")

        normalized_agent_id = _normalize_agent_id(self.agent_id)
        normalized_dir = Path(self.chat_history_dir).expanduser().resolve(strict=False)
        object.__setattr__(self, "agent_id", normalized_agent_id)
        object.__setattr__(self, "chat_history_dir", normalized_dir)

    def to_payload(self) -> dict[str, str]:
        """转换为 cron frontmatter 等持久化边界使用的简单字典。"""
        return {
            "provider_type": self.target.provider_type.value,
            "agent_name": self.target.agent_name,
            "agent_id": self.agent_id,
            "chat_history_dir": str(self.chat_history_dir),
        }

    @classmethod
    def from_payload(cls, payload: Mapping[str, object]) -> "AgentSessionRef":
        """从持久化字典恢复，并显式保留 Provider 身份。"""
        if not isinstance(payload, Mapping):
            raise TypeError("Agent session reference must be a mapping")

        provider_value = _required_string(payload, "provider_type")
        try:
            provider_type = AgentProviderType(provider_value)
        except ValueError as exc:
            raise ValueError(f"Unknown agent provider type: {provider_value}") from exc

        return cls(
            target=AgentTarget(
                provider_type=provider_type,
                agent_name=_required_string(payload, "agent_name"),
            ),
            agent_id=_required_string(payload, "agent_id"),
            chat_history_dir=Path(_required_string(payload, "chat_history_dir")),
        )


def _required_string(payload: Mapping[str, object], field_name: str) -> str:
    value = payload.get(field_name)
    if not isinstance(value, str):
        raise ValueError(f"{field_name} must be a string")
    normalized = value.strip()
    if not normalized:
        raise ValueError(f"{field_name} cannot be empty")
    return normalized


def _normalize_agent_id(agent_id: str) -> str:
    if not isinstance(agent_id, str):
        raise TypeError("agent_id must be a string")
    normalized = agent_id.strip()
    if not normalized:
        raise ValueError("agent_id cannot be empty")
    if normalized in {".", ".."} or "/" in normalized or "\\" in normalized or "\0" in normalized:
        raise ValueError(f"Invalid agent_id: {agent_id}")
    return normalized


__all__ = ["AgentSessionRef"]
