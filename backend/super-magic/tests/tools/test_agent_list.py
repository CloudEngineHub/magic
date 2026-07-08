from agentlang.context.tool_context import ToolContext
import pytest

from app.tools.agent_list import AgentList, AgentListParams


class _FakeAgentContext:
    def __init__(self, enabled=True, agent_code=""):
        self._enabled = enabled
        self._agent_code = agent_code

    def is_subagent_delegation_enabled(self):
        return self._enabled

    def get_agent_code(self):
        return self._agent_code


class _FakeAgent:
    def __init__(self, code, name, description):
        self.code = code
        self._payload = {
            "code": code,
            "name": name,
            "description": description,
        }

    def to_dict(self):
        return dict(self._payload)


class _FakeListResult:
    def __init__(self, agents):
        self._agents = agents

    def get_agents(self):
        return self._agents


class _FakeAgentApi:
    """Simulates the available-agents API, including server-side keyword search."""

    def __init__(self, agents):
        self._agents = agents
        self.calls = []

    async def list_available_agents_async(self, parameter):
        keywords = [k.lower() for k in (getattr(parameter, "keywords", []) or [])]
        self.calls.append(keywords)
        items = self._agents
        if keywords:
            items = [
                agent
                for agent in items
                if any(
                    k in (agent._payload["name"] + " " + agent._payload["description"]).lower()
                    for k in keywords
                )
            ]
        return _FakeListResult(items)


class _FakeSdk:
    def __init__(self, agents):
        self.agent = _FakeAgentApi(agents)


def _tool_context(agent_context):
    tool_context = ToolContext()
    tool_context.register_extension("agent_context", agent_context)
    return tool_context


@pytest.mark.asyncio
async def test_agent_list_filters_agents_and_excludes_current(monkeypatch):
    agents = [
        _FakeAgent("SMA-self", "Current", "Current agent"),
        _FakeAgent("SMA-data", "Data Analyst", "Analyzes datasets"),
        _FakeAgent("SMA-writer", "Writer", "Writes reports"),
        _FakeAgent("", "No Code", "Missing code"),
    ]
    sdk = _FakeSdk(agents)
    monkeypatch.setattr("app.tools.agent_list.get_magic_service_sdk", lambda: sdk)

    tool = AgentList()
    output = await tool.execute(
        _tool_context(_FakeAgentContext(enabled=True, agent_code="SMA-self")),
        AgentListParams(name_filter="data", limit=10),
    )

    assert output.ok is True
    assert output.data["agents"] == [
        {
            "code": "SMA-data",
            "name": "Data Analyst",
            "description": "Analyzes datasets",
        }
    ]
    assert "code=SMA-data" in output.content
    # Keywords are forwarded to the server; no fallback needed when something matches.
    assert sdk.agent.calls == [["data"]]


@pytest.mark.asyncio
async def test_agent_list_falls_back_to_full_list_when_keywords_miss(monkeypatch):
    agents = [
        _FakeAgent("SMA-self", "Current", "Current agent"),
        _FakeAgent("SMA-data", "Data Analyst", "Analyzes datasets"),
        _FakeAgent("SMA-writer", "Writer", "Writes reports"),
    ]
    sdk = _FakeSdk(agents)
    monkeypatch.setattr("app.tools.agent_list.get_magic_service_sdk", lambda: sdk)

    tool = AgentList()
    output = await tool.execute(
        _tool_context(_FakeAgentContext(enabled=True, agent_code="SMA-self")),
        AgentListParams(name_filter="nonexistent", limit=10),
    )

    assert output.ok is True
    codes = [agent["code"] for agent in output.data["agents"]]
    assert codes == ["SMA-data", "SMA-writer"]
    assert "No Crew agent matched" in output.content
    # First call with keywords returns nothing, second call without keywords returns the full list.
    assert sdk.agent.calls == [["nonexistent"], []]


@pytest.mark.asyncio
async def test_agent_list_requires_subagent_delegation_capability():
    tool = AgentList()
    output = await tool.execute(
        _tool_context(_FakeAgentContext(enabled=False)),
        AgentListParams(),
    )

    assert output.ok is False
    assert "Sub-agent delegation is not enabled" in output.content


@pytest.mark.asyncio
async def test_agent_list_hides_raw_sdk_errors(monkeypatch):
    sensitive_error = "GET http://internal.service.local/agents?token=secret failed"

    def _raise():
        raise RuntimeError(sensitive_error)

    monkeypatch.setattr("app.tools.agent_list.get_magic_service_sdk", _raise)

    tool = AgentList()
    output = await tool.execute(
        _tool_context(_FakeAgentContext(enabled=True)),
        AgentListParams(),
    )

    assert output.ok is False
    assert sensitive_error not in output.content
    assert output.extra_info["error"] == sensitive_error
