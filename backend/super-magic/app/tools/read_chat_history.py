from __future__ import annotations

from datetime import datetime, timezone

from pydantic import Field, model_validator

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.context.agent_context import AgentContext
from app.service.chat_history_query_service import (
    ChatHistoryQueryService,
    MessageType,
    format_history_time,
    parse_time_range,
)
from app.tools.core import BaseTool, BaseToolParams, tool


class ReadChatHistoryParams(BaseToolParams):
    history_file: str = Field(..., min_length=1, description="Relative path returned by list_chat_history or search_chat_history.")
    start: int = Field(0, ge=0, description="First original message index, inclusive.")
    end: int = Field(20, ge=0, description="Last original message index, exclusive; maximum range is 50.")
    message_types: list[MessageType] | None = Field(
        None,
        description="Optional message types: user_input, user, assistant, tool, or system. Omit to include all types.",
    )
    time_range: str | None = Field(
        None,
        max_length=120,
        description="A single time string such as 'today', 'last 7 days', 'last 2 hours', 'since <date>', or '<start> to <end>'.",
    )

    @model_validator(mode="after")
    def validate_range(self) -> "ReadChatHistoryParams":
        if self.end < self.start:
            raise ValueError("end must be greater than or equal to start")
        if self.end - self.start > 50:
            raise ValueError("message range must be at most 50 messages")
        return self


# Full model-facing usage guidance: agents/skills/chat-history/SKILL.md
@tool(code_mode_only=True)
class ReadChatHistory(BaseTool[ReadChatHistoryParams]):
    """Read a bounded message range from one saved chat history file."""

    async def execute(self, tool_context: ToolContext, params: ReadChatHistoryParams) -> ToolResult:
        context = tool_context.get_extension_typed("agent_context", AgentContext)
        if context is None or context.is_subagent_context():
            return ToolResult.error("Chat history lookup is available only to the main Agent.")

        try:
            service = _build_service(context)
            result = await service.read_range(
                history_file=params.history_file,
                start=params.start,
                end=params.end,
                message_types=params.message_types,
                time_range=parse_time_range(params.time_range, context.get_user_timezone()),
            )
        except Exception as exc:
            return ToolResult.error(f"Chat history read failed: {exc}")

        lines = [
            f"Read {len(result['messages'])} matching messages from {params.history_file} "
            f"in message range [{params.start}, {params.end})."
        ]
        remaining_chars = 12_000
        for message in result["messages"]:
            content = str(message.get("content") or "")
            timestamp = format_history_time(
                _timestamp_to_datetime(message.get("timestamp")),
                context.get_user_timezone(),
            )
            header = f"[{message['message_index']}] {message['message_type']} | {timestamp}: "
            available = max(remaining_chars - len(header), 0)
            if available == 0:
                lines.append("Output limit reached. Read a smaller or later range to continue.")
                break
            excerpt = content[:available]
            lines.append(header + excerpt)
            remaining_chars -= len(header) + len(excerpt)
            if len(excerpt) < len(content):
                lines.append("Message truncated. Read a smaller range around this message to continue.")
                break
        return ToolResult(content="\n".join(lines), data=result)


def _build_service(context: AgentContext) -> ChatHistoryQueryService:
    return ChatHistoryQueryService(
        context.agent_name,
        context.get_agent_id() or "main",
        chat_history=getattr(context, "chat_history", None),
        interruption_event=context.get_interruption_event(),
    )


def _timestamp_to_datetime(value: object) -> datetime | None:
    if not isinstance(value, (int, float)):
        return None
    return datetime.fromtimestamp(value, timezone.utc)


__all__ = ["ReadChatHistory", "ReadChatHistoryParams"]
