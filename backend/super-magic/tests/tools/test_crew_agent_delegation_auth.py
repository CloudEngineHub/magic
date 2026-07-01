from agentlang.context.tool_context import ToolContext
import pytest

from app.core.subagent_delegation import is_crew_agent_code
from app.tools.call_subagent import CallSubagent, CallSubagentParams
from app.tools.subagent_runtime_models import SubagentSessionState, SubagentStatus, utc_now
from app.tools.subagent_runtime_store import SubagentRuntimeStore
from app.tools.wait_for_subagents import WaitForSubagents, WaitForSubagentsParams


class _FakeAgentContext:
    context_id = "ctx"

    def __init__(self, enabled=False, agent_code=""):
        self._enabled = enabled
        self._agent_code = agent_code

    def is_subagent_delegation_enabled(self):
        return self._enabled

    def get_subagent_depth(self):
        return 0

    def get_agent_code(self):
        return self._agent_code


class _FakeHandle:
    def is_running(self):
        return False


def _tool_context(agent_context):
    tool_context = ToolContext(tool_call_id="call-test")
    tool_context.register_extension("agent_context", agent_context)
    return tool_context


def test_only_sma_codes_are_treated_as_crew_agents():
    assert is_crew_agent_code("SMA-data") is True
    assert is_crew_agent_code("SMA_data") is True
    assert is_crew_agent_code("explore") is False
    assert is_crew_agent_code("magic") is False
    assert is_crew_agent_code("data-analyst") is False


@pytest.mark.asyncio
async def test_call_subagent_rejects_unauthorized_crew_agent():
    tool = CallSubagent()

    result = await tool.execute(
        _tool_context(_FakeAgentContext(enabled=False)),
        CallSubagentParams(
            agent_name="SMA-data",
            agent_id="crew-test-data",
            prompt="Analyze the dataset.",
            background=True,
        ),
    )

    assert result.ok is False
    assert "Sub-agent delegation is not enabled" in result.content


@pytest.mark.asyncio
async def test_call_subagent_rejects_crew_agent_self_call():
    tool = CallSubagent()

    result = await tool.execute(
        _tool_context(_FakeAgentContext(enabled=True, agent_code="SMA-data")),
        CallSubagentParams(
            agent_name="SMA-data",
            agent_id="crew-test-data",
            prompt="Analyze the dataset.",
            background=True,
        ),
    )

    assert result.ok is False
    assert "current parent agent" in result.content


@pytest.mark.asyncio
async def test_wait_for_subagents_rejects_unauthorized_crew_agent(monkeypatch):
    async def _find_states(cls, agent_id):
        return [
            SubagentSessionState(
                agent_name="SMA-data",
                agent_id=agent_id,
                status=SubagentStatus.RUNNING,
                started_at=utc_now(),
            )
        ]

    async def _get_handle(agent_name, agent_id):
        return _FakeHandle()

    monkeypatch.setattr(
        SubagentRuntimeStore,
        "find_states_by_agent_id",
        classmethod(_find_states),
    )
    monkeypatch.setattr(
        "app.tools.wait_for_subagents.subagent_session_manager.get_handle",
        _get_handle,
    )

    tool = WaitForSubagents()
    result = await tool.execute(
        _tool_context(_FakeAgentContext(enabled=False)),
        WaitForSubagentsParams(agent_ids=["crew-test-data"], timeout=0),
    )

    assert result.ok is False
    assert "Sub-agent delegation is not enabled" in result.content
