"""Agent 运行时共享类型。"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from app.core.entity.agent_profile import AgentProfile
from app.core.entity.message.client_message import AgentMode
from app.core.subagent_delegation import is_custom_agent_code


class AgentProviderType(StrEnum):
    """负责准备 Agent 定义的 Provider 类型。"""

    BUILTIN = "builtin"
    CREW = "crew"
    CLAW = "claw"


class AgentLifetime(StrEnum):
    """Agent 实例是否由进程级 Runtime 缓存。"""

    CACHED = "cached"
    TRANSIENT = "transient"


class DynamicInitPolicy(StrEnum):
    """新建 transient Agent 的动态上下文初始化策略。"""

    CACHED_ONLY = "cached_only"
    EVERY_INSTANCE = "every_instance"


class AgentTargetError(ValueError):
    """Agent 目标缺失、冲突或不安全。"""


@dataclass(frozen=True)
class AgentTarget:
    """已经规范化、可以直接交给 Runtime 的 Agent 目标。

    ``agent_name`` 是 Runtime 加载的 ``.agent`` 定义名称，不是 Profile
    展示名称。请求中的 ``agent_code`` 只在 ``from_mode()`` 边界出现；
    Crew 和 Claw Provider 分别在自身范围内将 ``agent_name`` 解释为
    ``agent_code`` 或 ``claw_code``。Target 不携带模型、Context、缓存、
    本次运行参数或展示信息。
    """

    provider_type: AgentProviderType
    agent_name: str

    def __post_init__(self) -> None:
        if not isinstance(self.provider_type, AgentProviderType):
            raise AgentTargetError("provider_type must be an AgentProviderType")

        normalized_name = _normalize_target_name(self.agent_name, field_name="agent_name")
        if self.provider_type == AgentProviderType.CREW and not is_custom_agent_code(normalized_name):
            raise AgentTargetError(f"Invalid Crew agent code: {normalized_name}")
        object.__setattr__(self, "agent_name", normalized_name)

    @classmethod
    def from_mode(
        cls,
        agent_mode: AgentMode | str,
        agent_code: str | None = None,
    ) -> "AgentTarget":
        """将消息协议的 mode/code 转成唯一 Runtime 目标。"""
        if isinstance(agent_mode, AgentMode):
            mode = agent_mode
        elif isinstance(agent_mode, str):
            mode_value = _normalize_target_name(agent_mode, field_name="agent_mode")
            try:
                mode = AgentMode(mode_value)
            except ValueError:
                if agent_code is not None:
                    raise AgentTargetError(
                        f"agent_code is not valid for unknown agent mode: {mode_value}"
                    )
                return cls.from_name(mode_value)
        else:
            raise AgentTargetError(f"Unsupported agent mode: {agent_mode}")

        normalized_code = (
            _normalize_target_name(agent_code, field_name="agent_code")
            if agent_code is not None
            else None
        )

        if mode == AgentMode.CUSTOM_AGENT:
            if normalized_code is None:
                raise AgentTargetError(f"agent_code is required for mode: {mode.value}")
            if not is_custom_agent_code(normalized_code):
                raise AgentTargetError(f"Invalid Crew agent code: {normalized_code}")
            return cls(AgentProviderType.CREW, normalized_code)

        if mode == AgentMode.MAGICLAW:
            if normalized_code is None:
                raise AgentTargetError(f"agent_code is required for mode: {mode.value}")
            return cls(AgentProviderType.CLAW, normalized_code)

        if normalized_code is not None:
            raise AgentTargetError(f"agent_code is not valid for built-in mode: {mode.value}")
        return cls(AgentProviderType.BUILTIN, mode.get_agent_type())

    @classmethod
    def from_name(cls, agent_name: str) -> "AgentTarget":
        """从明确名称创建 Built-in 或 Crew 目标，绝不按名称猜测 Claw。"""
        normalized_name = _normalize_target_name(agent_name, field_name="agent_name")
        canonical_name = AgentMode.resolve_agent_type(normalized_name)
        provider_type = (
            AgentProviderType.CREW
            if is_custom_agent_code(canonical_name)
            else AgentProviderType.BUILTIN
        )
        return cls(provider_type, canonical_name)


@dataclass(frozen=True)
class AgentDefinition:
    """Provider 准备完成的不可变结果，不表示 live Agent 或 Context 身份副本。"""

    target: AgentTarget
    profile: AgentProfile
    revision: str
    dynamic_init_policy: DynamicInitPolicy


def _normalize_target_name(value: str, *, field_name: str) -> str:
    if not isinstance(value, str):
        raise AgentTargetError(f"{field_name} must be a string")
    normalized = value.strip()
    if not normalized:
        raise AgentTargetError(f"{field_name} cannot be empty")
    if ".." in normalized or "/" in normalized or "\\" in normalized:
        raise AgentTargetError(f"Invalid {field_name}: {value}")
    return normalized


__all__ = [
    "AgentDefinition",
    "AgentLifetime",
    "AgentProviderType",
    "AgentTarget",
    "AgentTargetError",
    "DynamicInitPolicy",
]
