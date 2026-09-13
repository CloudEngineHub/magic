from typing import TYPE_CHECKING, Optional

from app.channel.base.registry import build_default_channel_registry
from app.core.entity.message.client_message import ChatClientMessage
from app.core.skill_utils.suggestions import SkillSuggestion

if TYPE_CHECKING:
    from app.core.context.agent_context import AgentContext


class ChannelContextService:
    """构建渠道专属的模型上下文"""

    @classmethod
    def append_channel_context(cls, query: str, message: Optional[ChatClientMessage]) -> str:
        channel_name = message.metadata.channel_name if (message and message.metadata) else None
        if not channel_name:
            return query

        channel = build_default_channel_registry().get(channel_name)
        if channel is None:
            return query

        fragment = channel.build_agent_context_fragment(message)
        if not fragment:
            return query

        return f"{query}\n\n{fragment}"

    @classmethod
    async def suggest_channel_skills(
        cls,
        message: Optional[ChatClientMessage],
        agent_context: "AgentContext",
    ) -> None:
        """由渠道事件提供候选；可用性与跨来源去重统一交给 Horizon。"""
        channel_name = message.metadata.channel_name if (message and message.metadata) else None
        if not channel_name:
            return
        channel = build_default_channel_registry().get(channel_name)
        if channel is None:
            return
        await agent_context.horizon.suggest_skills(
            [SkillSuggestion(
                name="im-channels",
                reason=(
                    f"This message comes from {channel.source_name}; "
                    "the skill explains replies and media handling."
                ),
            )],
            source=f"channel:{channel.key}",
        )
