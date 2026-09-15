"""Magic for Super Magic."""

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.magic.agent import Agent

__all__ = ["Agent"]


def __getattr__(name: str) -> object:
    if name == "Agent":
        from app.magic.agent import Agent

        return Agent
    raise AttributeError(f"module 'app.magic' has no attribute {name!r}")
