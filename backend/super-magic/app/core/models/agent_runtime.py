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

    `agent_name` 是 Runtime 加载的 `.agent` 定义名称，不是 Profile
    展示名称。请求中的 `agent_code` 只在 `from_mode()` 边界出现；
    Crew 和 Claw Provider 分别在自身范围内将 `agent_name` 解释为
    `agent_code` 或 `claw_code`。Target 不携带模型、Context、缓存、
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
        """根据消息里的模式和编号，确定这次真正要运行哪个 Agent。

        `agent_mode` 表示用户进入了哪种模式。`agent_code` 的用途会随着模式
        改变，不能看到有编号就认为系统应该运行这个编号对应的 Agent：

        | agent_mode | agent_code 用来表示什么 | 系统实际运行什么 |
        | --- | --- | --- |
        | custom_agent | 要运行的数字员工编号，必须提供 | 这个编号对应的数字员工 |
        | magiclaw | 要运行的 Claw 编号，必须提供 | 这个编号对应的 Claw |
        | crew-creator | 当前准备编辑的员工编号，可以为空 | 内置的 crew-creator |
        | skill-creator | 不使用 Agent 编号 | 内置的 skill-creator |
        | 其他内置模式 | 不用于选择 Agent | 该模式对应的内置 Agent |

        返回的 `AgentTarget` 只回答一件事：系统这次真正运行谁。系统后续会根据
        它加载、复用和关闭 Agent，所以不能把 `crew-creator` 正在编辑的员工
        编号放进去。否则系统会误以为当前运行的是这个员工，而不是
        `crew-creator`。正在编辑的员工编号由 `AgentContext.get_agent_code()`
        从当前消息中读取。
        """
        if isinstance(agent_mode, AgentMode):
            mode = agent_mode
        elif isinstance(agent_mode, str):
            mode_value = _normalize_target_name(agent_mode, field_name="agent_mode")
            try:
                mode = AgentMode(mode_value)
            except ValueError as exc:
                if agent_code is not None:
                    raise AgentTargetError(
                        f"agent_code is not valid when agent_mode is a custom Agent code: {mode_value}"
                    ) from exc
                if is_custom_agent_code(mode_value):
                    return cls(AgentProviderType.CREW, mode_value)
                raise AgentTargetError(f"Unsupported agent mode: {mode_value}") from exc
        else:
            raise AgentTargetError(f"Unsupported agent mode: {agent_mode}")

        # 内置模式要运行的 Agent 已经由 agent_mode 确定。例如 crew-creator 即使
        # 携带了员工编号，系统仍然运行 crew-creator；这个编号只是告诉它要编辑谁。
        if mode not in {AgentMode.CUSTOM_AGENT, AgentMode.MAGICLAW}:
            return cls(AgentProviderType.BUILTIN, mode.get_agent_type())

        # custom_agent 和 magiclaw 确实需要通过编号找到要运行的对象。编号缺失或
        # 格式错误时应在这里直接报错，不要等到后面下载或加载时才暴露问题。
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

        raise AgentTargetError(f"Unsupported agent mode requiring agent_code: {mode.value}")

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
