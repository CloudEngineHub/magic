"""
AI 能力运行时配置接口。

agentlang 只定义配置对象需要满足的行为契约，不绑定具体业务能力字段。
"""
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional


class AIAbilityConfig(ABC):
    """单个 AI 能力运行时配置的抽象接口。"""

    @property
    @abstractmethod
    def ability_key(self) -> str:
        """返回能力 key。"""
        ...

    @property
    @abstractmethod
    def config(self) -> Dict[str, Any]:
        """返回当前配置字典。"""
        ...

    @property
    @abstractmethod
    def enabled(self) -> bool:
        """返回该配置是否启用。"""
        ...

    @property
    @abstractmethod
    def provider_source(self) -> str:
        """返回配置来源。"""
        ...

    @property
    @abstractmethod
    def priority(self) -> int:
        """返回配置来源优先级。"""
        ...

    @abstractmethod
    def get(self, key: str, default: Any = None) -> Any:
        """读取配置值。"""
        ...

    @abstractmethod
    def validate_for_merge(self) -> Optional[str]:
        """返回不可合并原因，返回 None 表示可以合并。"""
        ...

    @abstractmethod
    def merge_with(self, lower_priority_config: Optional["AIAbilityConfig"]) -> "AIAbilityConfig":
        """与低优先级配置合并并返回新的配置对象。"""
        ...
