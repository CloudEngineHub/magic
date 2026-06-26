from dataclasses import dataclass

import pytest
from agentlang.context.tool_context import ToolContext

from app.tools.prepare_agent import PrepareAgent, PrepareAgentParams


class _FakeAgentContext:
    def __init__(self, enabled=True):
        self._enabled = enabled

    def is_subagent_delegation_enabled(self):
        return self._enabled


def _tool_context(agent_context):
    tool_context = ToolContext()
    tool_context.register_extension("agent_context", agent_context)
    return tool_context


@dataclass
class _FakeRuntimeInfo:
    agent_code: str
    name: str = ""
    role: str = ""
    description: str = ""


@pytest.mark.asyncio
async def test_prepare_builtin_alias_is_normalized():
    tool = PrepareAgent()
    output = await tool.execute(
        _tool_context(_FakeAgentContext(enabled=True)),
        PrepareAgentParams(agent_code="ppt"),
    )

    assert output.ok is True
    assert output.data["kind"] == "builtin"
    assert output.data["agent_name"] == "slider"
    assert "slider" in output.content


@pytest.mark.asyncio
async def test_prepare_crew_agent_compiles_and_returns_local_name(monkeypatch):
    async def _fake_compile(agent_code):
        return _FakeRuntimeInfo(
            agent_code=agent_code,
            name="Data Analyst",
            role="analyst",
            description="Analyzes datasets",
        )

    monkeypatch.setattr("app.tools.prepare_agent._ensure_crew_agent_compiled", _fake_compile)

    tool = PrepareAgent()
    output = await tool.execute(
        _tool_context(_FakeAgentContext(enabled=True)),
        PrepareAgentParams(agent_code="SMA-data"),
    )

    assert output.ok is True
    assert output.data["kind"] == "crew"
    assert output.data["agent_name"] == "SMA-data"
    assert output.data["name"] == "Data Analyst"
    assert "SMA-data" in output.content


@pytest.mark.asyncio
async def test_prepare_requires_subagent_delegation_capability():
    tool = PrepareAgent()
    output = await tool.execute(
        _tool_context(_FakeAgentContext(enabled=False)),
        PrepareAgentParams(agent_code="SMA-data"),
    )

    assert output.ok is False
    assert "Sub-agent delegation is not enabled" in output.content


@pytest.mark.asyncio
async def test_prepare_requires_agent_code():
    tool = PrepareAgent()
    output = await tool.execute(
        _tool_context(_FakeAgentContext(enabled=True)),
        PrepareAgentParams(agent_code="   "),
    )

    assert output.ok is False
    assert "agent_code is required" in output.content


@pytest.mark.asyncio
async def test_prepare_hides_raw_compile_errors(monkeypatch):
    sensitive_error = "download http://internal.local/SMA-x.zip?token=secret failed"

    async def _raise(agent_code):
        raise RuntimeError(sensitive_error)

    monkeypatch.setattr("app.tools.prepare_agent._ensure_crew_agent_compiled", _raise)

    tool = PrepareAgent()
    output = await tool.execute(
        _tool_context(_FakeAgentContext(enabled=True)),
        PrepareAgentParams(agent_code="SMA-x"),
    )

    assert output.ok is False
    assert sensitive_error not in output.content
    assert output.extra_info["error"] == sensitive_error
