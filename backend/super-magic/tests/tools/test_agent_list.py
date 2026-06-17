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
    def __init__(self, code, name, description, agent_type):
        self.code = code
        self._payload = {
            "code": code,
            "name": name,
            "description": description,
            "type": agent_type,
            "icon": "",
        }

    def to_dict(self):
        return dict(self._payload)


class _FakeListResult:
    def __init__(self, agents):
        self._agents = agents

    def get_agents(self):
        return self._agents


class _FakeAgentApi:
    def __init__(self, result):
        self._result = result

    async def list_agents_async(self, parameter):
        return self._result


class _FakeSdk:
    def __init__(self, result):
        self.agent = _FakeAgentApi(result)


def _tool_context(agent_context):
    tool_context = ToolContext()
    tool_context.register_extension("agent_context", agent_context)
    return tool_context


def test_agent_list_params_treats_blank_type_filter_as_unset():
    params = AgentListParams(name_filter="", type_filter="", limit=30)

    assert params.type_filter is None


@pytest.mark.asyncio
async def test_agent_list_filters_agents_and_excludes_current(monkeypatch):
    agents = [
        _FakeAgent("SMA-self", "Current", "Current agent", "custom"),
        _FakeAgent("SMA-data", "Data Analyst", "Analyzes datasets", "custom"),
        _FakeAgent("SMA-writer", "Writer", "Writes reports", "official"),
        _FakeAgent("", "No Code", "Missing code", "custom"),
    ]
    result = _FakeListResult(agents)
    monkeypatch.setattr("app.tools.agent_list.get_magic_service_sdk", lambda: _FakeSdk(result))

    tool = AgentList()
    output = await tool.execute(
        _tool_context(_FakeAgentContext(enabled=True, agent_code="SMA-self")),
        AgentListParams(name_filter="data", type_filter="custom", limit=10),
    )

    assert output.ok is True
    assert output.data["agents"] == [
        {
            "code": "SMA-data",
            "name": "Data Analyst",
            "description": "Analyzes datasets",
            "type": "custom",
            "icon": "",
        }
    ]
    assert "code=SMA-data" in output.content


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
