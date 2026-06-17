from __future__ import annotations

from typing import Any, Dict, Literal, Optional

from agentlang.context.tool_context import ToolContext
from agentlang.logger import get_logger
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, TerminalContent, ToolDetail
from app.i18n import i18n
from app.infrastructure.sdk.magic_service.factory import get_magic_service_sdk
from app.infrastructure.sdk.magic_service.parameter.list_agents_parameter import ListAgentsParameter
from app.core.subagent_delegation import (
    build_crew_delegation_disabled_message,
    is_subagent_delegation_enabled,
)
from app.tools.core import BaseToolParams, tool
from app.tools.core.base_tool import BaseTool
from pydantic import Field, field_validator

logger = get_logger(__name__)


class AgentListParams(BaseToolParams):
    name_filter: Optional[str] = Field(
        None,
        description="Optional case-insensitive keyword used to filter Crew code, name, or description.",
    )
    type_filter: Optional[Literal["official", "custom", "public"]] = Field(
        None,
        description="Optional Crew type filter. Use one of: official, custom, public.",
    )
    limit: int = Field(
        30,
        ge=1,
        le=100,
        description="Maximum number of Crew agents to return. Default is 30, maximum is 100.",
    )

    @field_validator("type_filter", mode="before")
    @classmethod
    def normalize_type_filter(cls, value: Any) -> Any:
        if isinstance(value, str):
            value = value.strip()
            if not value:
                return None
        return value


@tool()
class AgentList(BaseTool[AgentListParams]):
    """List Crew agents available to the current user."""

    async def execute(self, tool_context: ToolContext, params: AgentListParams) -> ToolResult:
        agent_context = tool_context.get_extension("agent_context") if tool_context else None
        if not is_subagent_delegation_enabled(agent_context):
            message = build_crew_delegation_disabled_message()
            return ToolResult.error(
                message,
                extra_info={"error": "crew_agent_delegation_disabled", "user_error": message},
            )

        try:
            sdk = get_magic_service_sdk()
            result = await sdk.agent.list_agents_async(ListAgentsParameter())
            agents = [agent.to_dict() for agent in result.get_agents() if getattr(agent, "code", "")]
            agents = _filter_agents(
                agents,
                name_filter=params.name_filter,
                type_filter=params.type_filter,
                current_agent_code=_get_current_agent_code(agent_context),
            )
            agents = agents[: params.limit]
            return ToolResult(
                content=_build_agent_list_content(agents),
                data={"agents": agents, "total": len(agents)},
            )
        except Exception as e:
            logger.exception(f"Failed to list Crew agents: {e}")
            return ToolResult.error(
                "Unable to list available Crew agents. The Crew directory could not be reached or returned invalid data.",
                extra_info={"error": str(e), "user_error": i18n.translate("agent_list.error", category="tool.messages")},
            )

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: Dict[str, Any] = None
    ) -> Dict:
        return {
            "action": i18n.translate("agent_list", category="tool.actions"),
            "remark": i18n.translate("agent_list.searching", category="tool.messages"),
        }

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: Dict[str, Any] = None
    ) -> Optional[ToolDetail]:
        if not result.ok:
            extra = result.extra_info or {}
            output = extra.get("user_error") or i18n.translate("agent_list.error", category="tool.messages")
            return ToolDetail(
                type=DisplayType.TERMINAL,
                data=TerminalContent(
                    command="agent_list",
                    output=output,
                    exit_code=1,
                ),
            )

        data = result.data if isinstance(result.data, dict) else {}
        agents = data.get("agents", [])
        if not agents:
            output = i18n.translate("agent_list.empty", category="tool.messages")
        else:
            lines = []
            for index, agent in enumerate(agents, 1):
                name = agent.get("name") or agent.get("code", "")
                code = agent.get("code", "")
                agent_type = agent.get("type", "")
                description = agent.get("description", "")
                lines.append(f"{index}. {name} ({code})")
                if agent_type:
                    lines.append(f"   type: {agent_type}")
                if description:
                    lines.append(f"   description: {description}")
            output = "\n".join(lines)

        return ToolDetail(
            type=DisplayType.TERMINAL,
            data=TerminalContent(command="agent_list", output=output, exit_code=0),
        )

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: Dict[str, Any] = None,
    ) -> Dict:
        action = i18n.translate("agent_list", category="tool.actions")
        if not result.ok:
            return {"action": action, "remark": i18n.translate("agent_list.error", category="tool.messages")}
        data = result.data if isinstance(result.data, dict) else {}
        count = len(data.get("agents", []))
        return {
            "action": action,
            "remark": i18n.translate("agent_list.done", category="tool.messages", count=count),
        }


def _get_current_agent_code(agent_context: Any) -> str:
    getter = getattr(agent_context, "get_agent_code", None)
    if not callable(getter):
        return ""
    try:
        return str(getter() or "").strip()
    except Exception:
        return ""


def _filter_agents(
    agents: list[dict[str, Any]],
    name_filter: Optional[str],
    type_filter: Optional[str],
    current_agent_code: str,
) -> list[dict[str, Any]]:
    keyword = (name_filter or "").strip().lower()
    current_code = current_agent_code.strip()
    filtered: list[dict[str, Any]] = []
    for agent in agents:
        code = str(agent.get("code") or "").strip()
        if not code:
            continue
        if current_code and code == current_code:
            continue
        if type_filter and agent.get("type") != type_filter:
            continue
        if keyword:
            haystack = " ".join(
                str(agent.get(field) or "")
                for field in ("code", "name", "description")
            ).lower()
            if keyword not in haystack:
                continue
        filtered.append(agent)
    return filtered


def _build_agent_list_content(agents: list[dict[str, Any]]) -> str:
    if not agents:
        return "No available Crew agents matched the filters."

    lines = ["Available Crew agents:"]
    for index, agent in enumerate(agents, 1):
        code = agent.get("code", "")
        name = agent.get("name", "")
        agent_type = agent.get("type", "")
        description = agent.get("description", "")
        lines.append(f"{index}. code={code}, name={name}, type={agent_type}")
        if description:
            lines.append(f"   description={description}")
    return "\n".join(lines)
