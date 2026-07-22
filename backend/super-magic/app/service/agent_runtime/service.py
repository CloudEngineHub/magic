"""Unified Agent definition preparation, construction, initialization and cache."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import TYPE_CHECKING, ClassVar

from agentlang.logger import get_logger

from app.core.context.agent_context import AgentContext
from app.core.entity.agent_profile import AgentProfile
from app.core.models.agent_runtime import (
    AgentDefinition,
    AgentLifetime,
    AgentProviderType,
    AgentTarget,
    DynamicInitPolicy,
)
from app.service.agent_runtime.errors import (
    AgentDefinitionPrepareError,
    AgentRuntimeBusyError,
    AgentRuntimeError,
)
from app.service.agent_runtime.providers import (
    AgentDefinitionProvider,
    create_provider_map,
)

if TYPE_CHECKING:
    from app.magic.agent import Agent


logger = get_logger(__name__)


@dataclass
class AgentCacheEntry:
    """The one cached Agent allowed for a Context."""

    target: AgentTarget
    profile: AgentProfile
    agent: "Agent"


@dataclass
class ContextLockSlot:
    """Reference-counted lock slot for one Context."""

    lock: asyncio.Lock
    users: int = 0


class AgentRuntime:
    """把规范化 Target 转成可运行 Agent 的进程级唯一入口。

    Runtime 负责 Provider 准备、缓存判断、实例构造、动态初始化、失败回滚和关闭；
    调用方只描述目标与生命周期，不重复这些决策。
    """

    _instance: ClassVar["AgentRuntime | None"] = None

    def __init__(self) -> None:
        self._providers: dict[AgentProviderType, AgentDefinitionProvider] = create_provider_map()
        self._cache: dict[str, AgentCacheEntry] = {}
        self._context_locks: dict[str, ContextLockSlot] = {}
        self._closing: bool = False

    @classmethod
    def get_instance(cls) -> "AgentRuntime":
        """Return the process-level runtime instance."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    async def acquire(
        self,
        *,
        target: AgentTarget,
        lifetime: AgentLifetime,
        context: AgentContext,
        agent_id: str | None = None,
    ) -> "Agent":
        """Return an Agent whose definition and required dynamic state are ready."""
        if not isinstance(target, AgentTarget):
            raise AgentRuntimeError("target must be an AgentTarget")
        if not isinstance(lifetime, AgentLifetime):
            raise AgentRuntimeError(f"Unsupported Agent instance lifetime: {lifetime}")
        self._ensure_open()

        context_id = context.context_id

        async with self._context_lock(context_id):
            self._ensure_open()
            cached = self._cache.get(context_id)
            if lifetime == AgentLifetime.TRANSIENT and cached is not None:
                raise AgentRuntimeBusyError(
                    f"Transient Agent cannot share cached context {context_id}"
                )
            if cached is not None and cached.agent.has_active_run():
                raise AgentRuntimeBusyError(
                    f"Agent {cached.agent.agent_name} is running in context {context_id}"
                )

            if (
                lifetime == AgentLifetime.CACHED
                and cached is not None
                and cached.target == target
            ):
                self._bind_cached_context(context, cached)
                return cached.agent

            provider = self._providers[target.provider_type]
            definition = await self._prepare_definition(provider, target, context)
            self._ensure_open()
            if definition.target != target:
                raise AgentDefinitionPrepareError(
                    "Agent definition target does not match the requested target"
                )

            cached = self._cache.get(context_id)
            if cached is not None and cached.agent.has_active_run():
                raise AgentRuntimeBusyError(
                    f"Agent {cached.agent.agent_name} started while its definition was prepared"
                )

            if cached is not None:
                self._cache.pop(context_id, None)
                cached.agent.close()

            agent = await self._construct_agent(
                definition=definition,
                lifetime=lifetime,
                context=context,
                agent_id=agent_id,
            )
            if self._closing:
                cached = self._cache.get(context_id)
                if cached is not None and cached.agent is agent:
                    self._cache.pop(context_id, None)
                agent.close()
                self._ensure_open()
            return agent

    def get_cached_agent(self, context_id: str) -> "Agent | None":
        """Return the cached Agent for one Context, if any."""
        cached = self._cache.get(context_id)
        return cached.agent if cached is not None else None

    def list_cached_agents(self, context_id: str) -> tuple["Agent", ...]:
        """Return cached Agents for a Context as a stable snapshot."""
        cached = self._cache.get(context_id)
        return (cached.agent,) if cached is not None else ()

    def is_context_running(self, context_id: str) -> bool:
        """Return whether the cached Agent for a Context is currently running."""
        cached = self._cache.get(context_id)
        return cached is not None and cached.agent.has_active_run()

    async def invalidate_context(self, context_id: str, *, reason: str) -> tuple[str, ...]:
        """Close and remove the cached Agent for a Context."""
        if context_id not in self._context_locks and context_id not in self._cache:
            return ()

        async with self._context_lock(context_id):
            cached = self._cache.get(context_id)
            if cached is None:
                return ()
            if cached.agent.has_active_run():
                raise AgentRuntimeBusyError(
                    f"Agent {cached.agent.agent_name} is running in context {context_id}"
                )

            self._cache.pop(context_id, None)
            cached.agent.close()
            logger.info(
                f"Invalidated cached Agent: context_id={context_id}, "
                f"agent={cached.agent.agent_name}, reason={reason}"
            )
            return (cached.agent.agent_name,)

    async def close_all(self, *, reason: str) -> None:
        """Close all cached Agents during process shutdown."""
        self._closing = True
        while context_ids := set(self._cache) | set(self._context_locks):
            for context_id in context_ids:
                async with self._context_lock(context_id):
                    cached = self._cache.pop(context_id, None)
                    if cached is not None:
                        cached.agent.close()
                        logger.info(
                            f"Closed cached Agent: context_id={context_id}, "
                            f"agent={cached.agent.agent_name}, reason={reason}"
                        )

    @asynccontextmanager
    async def _context_lock(self, context_id: str) -> AsyncIterator[None]:
        slot = self._context_locks.get(context_id)
        if slot is None:
            slot = ContextLockSlot(lock=asyncio.Lock())
            self._context_locks[context_id] = slot
        slot.users += 1
        try:
            async with slot.lock:
                yield
        finally:
            slot.users -= 1
            if (
                slot.users == 0
                and context_id not in self._cache
                and self._context_locks.get(context_id) is slot
            ):
                self._context_locks.pop(context_id, None)

    def _ensure_open(self) -> None:
        if self._closing:
            raise AgentRuntimeError("AgentRuntime is closing")

    async def _prepare_definition(
        self,
        provider: AgentDefinitionProvider,
        target: AgentTarget,
        context: AgentContext,
    ) -> AgentDefinition:
        try:
            return await provider.prepare(target, context)
        except asyncio.CancelledError:
            raise
        except AgentDefinitionPrepareError:
            raise
        except Exception as exc:
            raise AgentDefinitionPrepareError("Failed to prepare Agent definition") from exc

    async def _construct_agent(
        self,
        *,
        definition: AgentDefinition,
        lifetime: AgentLifetime,
        context: AgentContext,
        agent_id: str | None,
    ) -> "Agent":
        previous_target = context.get_agent_target()
        previous_profile = context.get_agent_profile().model_copy(deep=True)
        agent: "Agent | None" = None

        self._bind_context(context, definition)
        try:
            from app.magic.agent import Agent

            agent = Agent(
                definition.target.agent_name,
                agent_id=agent_id,
                agent_context=context,
            )
            if self._should_complete_dynamic_init(definition, lifetime):
                await agent.async_complete_dynamic_init()

            if lifetime == AgentLifetime.CACHED:
                self._cache[context.context_id] = AgentCacheEntry(
                    target=definition.target,
                    profile=definition.profile.model_copy(deep=True),
                    agent=agent,
                )
            return agent
        except asyncio.CancelledError:
            self._cleanup_failed_construction(
                context=context,
                agent=agent,
                previous_target=previous_target,
                previous_profile=previous_profile,
            )
            raise
        except Exception as exc:
            self._cleanup_failed_construction(
                context=context,
                agent=agent,
                previous_target=previous_target,
                previous_profile=previous_profile,
            )
            if isinstance(exc, AgentRuntimeError):
                raise
            raise AgentRuntimeError(
                f"Failed to construct Agent: {definition.target.agent_name}"
            ) from exc

    @staticmethod
    def _should_complete_dynamic_init(
        definition: AgentDefinition,
        lifetime: AgentLifetime,
    ) -> bool:
        return (
            lifetime == AgentLifetime.CACHED
            or definition.dynamic_init_policy == DynamicInitPolicy.EVERY_INSTANCE
        )

    @staticmethod
    def _bind_context(context: AgentContext, definition: AgentDefinition) -> None:
        context.set_agent_target(definition.target)
        context.set_agent_profile(definition.profile.model_copy(deep=True))

    @staticmethod
    def _bind_cached_context(context: AgentContext, cached: AgentCacheEntry) -> None:
        context.set_agent_target(cached.target)
        context.set_agent_profile(cached.profile.model_copy(deep=True))

    @staticmethod
    def _cleanup_failed_construction(
        *,
        context: AgentContext,
        agent: "Agent | None",
        previous_target: AgentTarget | None,
        previous_profile: AgentProfile,
    ) -> None:
        if agent is not None:
            agent.close()
        else:
            from app.core.context.agent_context_registry import AgentContextRegistry

            AgentContextRegistry.get_instance().unregister(context)

        context.set_agent_target(previous_target)
        context.set_agent_profile(previous_profile)


__all__ = ["AgentRuntime"]
