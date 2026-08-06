"""Static Agent definition providers used by :class:`AgentRuntime`."""

from __future__ import annotations

import asyncio
from typing import Protocol

from app.core.context.agent_context import AgentContext
from app.core.entity.agent_profile import AgentProfile
from app.core.models.agent_runtime import (
    AgentDefinition,
    AgentProviderType,
    AgentTarget,
    DynamicInitPolicy,
)
from app.path_manager import PathManager
from app.service.agent_runtime.errors import AgentDefinitionPrepareError
from app.service.claw_agent_runtime_service import ClawAgentRuntimeService
from app.service.crew_agent_runtime_service import CrewAgentRuntimeService
from app.utils.async_file_utils import async_exists


class AgentDefinitionProvider(Protocol):
    """Agent 静态定义准备协议，仅在 Runtime 包内部使用。"""

    provider_type: AgentProviderType

    async def prepare(
        self,
        target: AgentTarget,
        context: AgentContext,
    ) -> AgentDefinition:
        """Prepare one immutable definition without mutating the context."""


class BuiltinAgentDefinitionProvider:
    """Prepare an existing local ``.agent`` definition."""

    provider_type = AgentProviderType.BUILTIN

    async def prepare(self, target: AgentTarget, context: AgentContext) -> AgentDefinition:
        _ensure_provider_type(target, self.provider_type)
        agent_name = target.agent_name
        try:
            agent_file = PathManager.get_compiled_agent_file(agent_name)
            if not await async_exists(agent_file):
                raise AgentDefinitionPrepareError(
                    f"Built-in Agent definition does not exist: {agent_name}"
                )
            profile = _copy_profile(context.get_agent_profile())
            return _build_definition(
                target=target,
                profile=profile,
                dynamic_init_policy=DynamicInitPolicy.CACHED_ONLY,
            )
        except asyncio.CancelledError:
            raise
        except AgentDefinitionPrepareError:
            raise
        except Exception as exc:
            raise AgentDefinitionPrepareError(
                f"Failed to prepare built-in Agent definition: {agent_name}"
            ) from exc


class CrewAgentDefinitionProvider:
    """Prepare a Crew package and adapt it to the shared definition contract."""

    provider_type = AgentProviderType.CREW

    async def prepare(self, target: AgentTarget, context: AgentContext) -> AgentDefinition:
        _ensure_provider_type(target, self.provider_type)
        agent_code = target.agent_name
        try:
            if context.is_main_agent:
                runtime_service = CrewAgentRuntimeService()
            else:
                runtime_service = CrewAgentRuntimeService(on_cache_invalidated=_ignore_cache_invalidation)

            info = await runtime_service.ensure_compiled(agent_code)
            profile = _profile_from_runtime_info(
                context=context,
                name=info.name,
                role=info.role,
                description=info.description,
            )
            return _build_definition(
                target=target,
                profile=profile,
                dynamic_init_policy=DynamicInitPolicy.CACHED_ONLY,
            )
        except asyncio.CancelledError:
            raise
        except AgentDefinitionPrepareError:
            raise
        except Exception as exc:
            raise AgentDefinitionPrepareError(
                f"Failed to prepare Crew Agent definition: {agent_code}"
            ) from exc


class ClawAgentDefinitionProvider:
    """Prepare MagicClaw workspace files and adapt the compiled definition."""

    provider_type = AgentProviderType.CLAW

    def __init__(self) -> None:
        self._runtime_service = ClawAgentRuntimeService()

    async def prepare(self, target: AgentTarget, context: AgentContext) -> AgentDefinition:
        _ensure_provider_type(target, self.provider_type)
        claw_code = target.agent_name
        try:
            info = await self._runtime_service.prepare(claw_code)
            profile = _profile_from_runtime_info(
                context=context,
                name=info.name,
                role=info.role,
                description=info.description,
            )
            return _build_definition(
                target=target,
                profile=profile,
                dynamic_init_policy=DynamicInitPolicy.EVERY_INSTANCE,
            )
        except asyncio.CancelledError:
            raise
        except AgentDefinitionPrepareError:
            raise
        except Exception as exc:
            raise AgentDefinitionPrepareError(
                f"Failed to prepare MagicClaw Agent definition: {claw_code}"
            ) from exc


def create_provider_map() -> dict[AgentProviderType, AgentDefinitionProvider]:
    """Create the fixed provider mapping owned by the process runtime."""
    providers: tuple[AgentDefinitionProvider, ...] = (
        BuiltinAgentDefinitionProvider(),
        CrewAgentDefinitionProvider(),
        ClawAgentDefinitionProvider(),
    )
    return {provider.provider_type: provider for provider in providers}


def _ensure_provider_type(target: AgentTarget, expected: AgentProviderType) -> None:
    if target.provider_type != expected:
        raise AgentDefinitionPrepareError(
            f"Provider {expected.value} cannot prepare target {target.provider_type.value}"
        )


def _copy_profile(profile: AgentProfile) -> AgentProfile:
    return profile.model_copy(deep=True)


def _profile_from_runtime_info(
    *,
    context: AgentContext,
    name: str,
    role: str,
    description: str,
) -> AgentProfile:
    if not name:
        return _copy_profile(context.get_agent_profile())
    return AgentProfile(name=name, role=role, description=description)


def _build_definition(
    *,
    target: AgentTarget,
    profile: AgentProfile,
    dynamic_init_policy: DynamicInitPolicy,
) -> AgentDefinition:
    return AgentDefinition(
        target=target,
        profile=profile,
        dynamic_init_policy=dynamic_init_policy,
    )


def _ignore_cache_invalidation(agent_code: str, reason: str) -> None:
    """Transient Crew preparation must not reset the parent's global Skill cache."""


__all__ = [
    "AgentDefinitionProvider",
    "BuiltinAgentDefinitionProvider",
    "ClawAgentDefinitionProvider",
    "CrewAgentDefinitionProvider",
    "create_provider_map",
]
