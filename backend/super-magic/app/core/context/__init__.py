"""
上下文管理模块

提供上下文类，用于代理与工具间的参数传递和环境管理
"""

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.core.context.agent_context import AgentContext

__all__ = ["AgentContext"]

def __getattr__(name: str):
    if name == "AgentContext":
        from app.core.context.agent_context import AgentContext
        return AgentContext
    raise AttributeError(name)
