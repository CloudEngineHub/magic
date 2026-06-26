from __future__ import annotations

from typing import Any, Dict, Optional

from agentlang.context.tool_context import ToolContext
from agentlang.logger import get_logger
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.client_message import AgentMode
from app.core.entity.message.server_message import DisplayType, TerminalContent, ToolDetail
from app.core.subagent_delegation import is_crew_agent_code
from app.i18n import i18n
from app.tools.core import BaseToolParams, tool
from app.tools.core.base_tool import BaseTool
from pydantic import Field

logger = get_logger(__name__)


class PrepareAgentParams(BaseToolParams):
    agent_code: str = Field(
        ...,
        description="""<!--zh: 要准备的目标员工标识。可以是 Crew 数字员工的 code（SMA- 开头，来自 agent_list 的结果），也可以是内置 agent 的名称或别名（如 magic、explore、ppt、data_analysis）。-->
Target agent identifier to prepare. Either a Crew digital-employee code (starts with SMA-, taken from an agent_list result) or a built-in agent name/alias (e.g. magic, explore, ppt, data_analysis).""",
    )


@tool()
class PrepareAgent(BaseTool[PrepareAgentParams]):
    """Make an agent dispatchable by call_subagent. For a Crew employee code it downloads and compiles the employee into a local .agent; for a built-in agent it normalizes the name/alias. Returns the local agent_name to pass to call_subagent."""

    async def execute(self, tool_context: ToolContext, params: PrepareAgentParams) -> ToolResult:
        agent_context = tool_context.get_extension("agent_context") if tool_context else None
        raw = (params.agent_code or "").strip()
        if not raw:
            return ToolResult.error(
                "agent_code is required: pass a Crew employee code (SMA-...) or a built-in agent name.",
                extra_info={"error": "missing_agent_code"},
            )

        try:
            if is_crew_agent_code(raw):
                info = await _ensure_crew_agent_compiled(raw)
                local_name = info.agent_code
                content = (
                    f"Crew agent `{local_name}` is ready as a local .agent file. "
                    f"Now call call_subagent with agent_name='{local_name}' and display_name='{info.name}' to dispatch the task."
                )
                data = {
                    "agent_name": local_name,
                    "kind": "crew",
                    "name": info.name,
                    "role": info.role,
                    "description": info.description,
                }
                return ToolResult(content=content, data=data)

            local_name = AgentMode.resolve_agent_type(raw)
            content = (
                f"Built-in agent `{local_name}` is ready. "
                f"Now call call_subagent with agent_name='{local_name}' to dispatch the task."
            )
            return ToolResult(content=content, data={"agent_name": local_name, "kind": "builtin"})
        except Exception as e:
            logger.exception(f"Failed to prepare agent '{raw}': {e}")
            return ToolResult.error(
                f"Unable to prepare agent `{raw}`. The employee package could not be downloaded or compiled. "
                "Verify the code via agent_list and try again.",
                extra_info={"error": str(e), "user_error": i18n.translate("prepare_agent.error", category="tool.messages")},
            )

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: Dict[str, Any] = None
    ) -> Dict:
        return {
            "action": i18n.translate("prepare_agent", category="tool.actions"),
            "remark": i18n.translate("prepare_agent.preparing", category="tool.messages"),
        }

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: Dict[str, Any] = None
    ) -> Optional[ToolDetail]:
        args = arguments or {}
        agent_code = args.get("agent_code", "")
        if not result.ok:
            extra = result.extra_info or {}
            output = extra.get("user_error") or i18n.translate("prepare_agent.error", category="tool.messages")
            return ToolDetail(
                type=DisplayType.TERMINAL,
                data=TerminalContent(command=f"prepare_agent {agent_code}", output=output, exit_code=1),
            )

        data = result.data if isinstance(result.data, dict) else {}
        local_name = data.get("agent_name", agent_code)
        name = data.get("name", "")
        output = i18n.translate("prepare_agent.ready", category="tool.messages", agent=name or local_name)
        return ToolDetail(
            type=DisplayType.TERMINAL,
            data=TerminalContent(command=f"prepare_agent {agent_code}", output=output, exit_code=0),
        )

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: Dict[str, Any] = None,
    ) -> Dict:
        action = i18n.translate("prepare_agent", category="tool.actions")
        if not result.ok:
            return {"action": action, "remark": i18n.translate("prepare_agent.error", category="tool.messages")}
        return {"action": action, "remark": i18n.translate("prepare_agent.done", category="tool.messages")}


async def _ensure_crew_agent_compiled(agent_code: str):
    """Download + compile a Crew employee into a local .agent without resetting the parent's global skill cache.

    The default cache-invalidation path calls GlobalSkillManager.reset(), which clears the currently
    running agent's resolved skill dirs/agent-type mid-run. A sub-agent we are preparing loads its own
    files fresh on construction, so we pass a no-op invalidation callback to avoid disrupting the parent run.
    """
    from app.service.crew_agent_runtime_service import CrewAgentRuntimeService

    def _no_global_reset(code: str, reason: str) -> None:
        logger.info(f"Prepared crew sub-agent, skip global skill reset: code={code}, reason={reason}")

    return await CrewAgentRuntimeService(on_cache_invalidated=_no_global_reset).ensure_compiled(agent_code)
