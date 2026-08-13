from __future__ import annotations

from datetime import datetime, timezone

from pydantic import Field, model_validator

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.context.agent_context import AgentContext
from app.service.chat_history_query_service import (
    ChatHistoryQueryService,
    HistoryType,
    MessageType,
    format_history_time,
    parse_time_range,
)
from app.tools.core import BaseTool, BaseToolParams, tool


class SearchChatHistoryParams(BaseToolParams):
    history_types: list[HistoryType] | None = Field(
        None,
        description="History groups to search: current, compacted, or subagent.",
    )
    history_files: list[str] | None = Field(
        None,
        max_length=50,
        description="Exact relative history files returned by list_chat_history. Use this instead of history_types when the files are known.",
    )
    time_range: str | None = Field(
        None,
        max_length=120,
        description="A single time string such as 'today', 'last 7 days', 'last 2 hours', 'since <date>', or '<start> to <end>'.",
    )
    message_types: list[MessageType] | None = Field(
        None,
        description="Optional message types: user_input, user, assistant, tool, or system. Omit to include all types.",
    )
    pattern: str | None = Field(
        None,
        min_length=1,
        max_length=200,
        description="Optional ripgrep regular expression. Spaces stay literal; use |, groups, and character ranges when needed.",
    )
    limit: int = Field(20, ge=1, le=50, description="Maximum number of matching messages to return.")

    @model_validator(mode="after")
    def validate_scope(self) -> "SearchChatHistoryParams":
        if bool(self.history_types) == bool(self.history_files):
            raise ValueError("Provide exactly one of history_types or history_files")
        if not self.pattern and not self.message_types and not self.time_range:
            raise ValueError("pattern is optional only when message_types or time_range is provided")
        return self


# Full model-facing usage guidance: agents/skills/chat-history/SKILL.md
@tool(code_mode_only=True)
class SearchChatHistory(BaseTool[SearchChatHistoryParams]):
    """Search selected chat history with a ripgrep pattern and bounded output."""

    async def execute(self, tool_context: ToolContext, params: SearchChatHistoryParams) -> ToolResult:
        context = tool_context.get_extension_typed("agent_context", AgentContext)
        if context is None or context.is_subagent_context():
            return ToolResult.error("Chat history lookup is available only to the main Agent.")

        try:
            service = _build_service(context)
            result = await service.search(
                history_types=params.history_types,
                history_files=params.history_files,
                pattern=params.pattern,
                message_types=params.message_types,
                time_range=parse_time_range(params.time_range, context.get_user_timezone()),
                limit=params.limit,
            )
        except Exception as exc:
            return ToolResult.error(f"Chat history search failed: {exc}")

        lines = [
            f"Searched {result['searched_files']} of {result['candidate_files']} selected history files and found {result['total_matches']} matching messages.",
            f"Time range: {result['history_range']}.",
        ]
        if result["skipped_files"]:
            lines.append(f"Skipped {result['skipped_files']} oversized history files; narrow the history range to search them.")
        if result["truncated"]:
            lines.append("The result limit was reached. Narrow the history range or use a more specific pattern.")
        for item in result["matches"]:
            timestamp = format_history_time(
                _timestamp_to_datetime(item.get("timestamp")),
                context.get_user_timezone(),
            )
            lines.append(
                f"- {item['history_file']} message {item['message_index']} | {timestamp} | "
                f"{item['message_type']}\n  {item['excerpt'] or '(empty message)'}"
            )
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


__all__ = ["SearchChatHistory", "SearchChatHistoryParams"]
