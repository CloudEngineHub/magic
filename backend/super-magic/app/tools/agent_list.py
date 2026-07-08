from __future__ import annotations

import re
from typing import Any, Dict, Optional

from agentlang.context.tool_context import ToolContext
from agentlang.logger import get_logger
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, TerminalContent, ToolDetail
from app.i18n import i18n
from app.infrastructure.sdk.magic_service.factory import get_magic_service_sdk
from app.infrastructure.sdk.magic_service.parameter.available_agents_parameter import AvailableAgentsParameter
from app.tools.core import BaseToolParams, tool
from app.tools.core.base_tool import BaseTool
from pydantic import Field

logger = get_logger(__name__)


class AgentListParams(BaseToolParams):
    name_filter: Optional[str] = Field(
        None,
        description="""<!--zh: 可选。一个或多个关键词，用用户当前使用的语言书写，用空格或逗号分隔；服务端按员工名称和描述做模糊匹配，任一关键词命中即返回。留空则返回全部可用员工。关键词匹配不到任何员工时会自动返回全部员工，便于你按名称和描述自行挑选。-->
Optional. One or more keywords in the user's current language, separated by spaces or commas; the server fuzzy-matches them against agent names and descriptions and returns an agent if any keyword hits. Leave empty to return all available agents. If the keywords match nothing, all agents are returned so you can still choose by name and description.""",
    )
    limit: int = Field(
        30,
        ge=1,
        le=100,
        description="Maximum number of Crew agents to return. Default is 30, maximum is 100.",
    )


@tool()
class AgentList(BaseTool[AgentListParams]):
    """List Crew agents available to the current user."""

    async def execute(self, tool_context: ToolContext, params: AgentListParams) -> ToolResult:
        agent_context = tool_context.get_extension("agent_context") if tool_context else None
        try:
            sdk = get_magic_service_sdk()
            current_code = _get_current_agent_code(agent_context)
            keywords = _parse_keywords(params.name_filter)

            agents = await _list_available_agents(sdk, keywords=keywords, page_size=params.limit)
            agents = _exclude_current(agents, current_code)

            keyword_miss = False
            if keywords and not agents:
                # Server-side search returned nothing — usually a too-narrow or off-language
                # keyword. Re-query without keywords so the caller still gets the full list to
                # choose from instead of an empty result.
                fallback = await _list_available_agents(sdk, keywords=[], page_size=params.limit)
                agents = _exclude_current(fallback, current_code)
                keyword_miss = True

            shown = agents[: params.limit]
            return ToolResult(
                content=_build_agent_list_content(
                    shown,
                    keywords=keywords,
                    keyword_miss=keyword_miss,
                ),
                data={"agents": shown, "total": len(shown)},
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
                description = agent.get("description", "")
                lines.append(f"{index}. {name} ({code})")
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


async def _list_available_agents(
    sdk: Any,
    keywords: list[str],
    page_size: int,
) -> list[dict[str, Any]]:
    """Fetch the current user's available agents via the available-agents API."""
    result = await sdk.agent.list_available_agents_async(
        AvailableAgentsParameter(keywords=keywords, page=1, page_size=page_size)
    )
    return [agent.to_dict() for agent in result.get_agents() if getattr(agent, "code", "")]


def _get_current_agent_code(agent_context: Any) -> str:
    getter = getattr(agent_context, "get_agent_code", None)
    if not callable(getter):
        return ""
    try:
        return str(getter() or "").strip()
    except Exception:
        return ""


def _parse_keywords(name_filter: Optional[str]) -> list[str]:
    """Split the name filter into keywords on whitespace and common separators (deduplicated)."""
    if not name_filter:
        return []
    parts = re.split(r"[\s,，、;；/|]+", name_filter.strip())
    keywords: list[str] = []
    for part in parts:
        part = part.strip()
        if part and part not in keywords:
            keywords.append(part)
    return keywords


def _exclude_current(agents: list[dict[str, Any]], current_agent_code: str) -> list[dict[str, Any]]:
    """Drop agents without a code and the current parent agent (avoid self-dispatch)."""
    current = (current_agent_code or "").strip()
    result: list[dict[str, Any]] = []
    for agent in agents:
        code = str(agent.get("code") or "").strip()
        if not code:
            continue
        if current and code == current:
            continue
        result.append(agent)
    return result


def _build_agent_list_content(
    agents: list[dict[str, Any]],
    keywords: list[str],
    keyword_miss: bool,
) -> str:
    if not agents:
        return "No Crew agents are available to the current user."

    lines: list[str] = []
    if keyword_miss:
        lines.append(
            f"No Crew agent matched the keyword(s): {', '.join(keywords)}. "
            "Showing all available agents instead — choose the most suitable by name and description."
        )
    elif keywords:
        lines.append(f"Available Crew agents matching: {', '.join(keywords)}")
    else:
        lines.append("Available Crew agents:")

    for index, agent in enumerate(agents, 1):
        code = agent.get("code", "")
        name = agent.get("name", "")
        description = agent.get("description", "")
        lines.append(f"{index}. code={code}, name={name}")
        if description:
            lines.append(f"   description={description}")
    lines.append(
        "\nNext step: to dispatch one of these, you MUST first call "
        "prepare_agent(agent_code='<the code above>') to download and compile it. "
        "prepare_agent returns a local agent_name; pass THAT to call_subagent. "
        "Do not pass the code or name above directly to call_subagent."
    )
    return "\n".join(lines)
