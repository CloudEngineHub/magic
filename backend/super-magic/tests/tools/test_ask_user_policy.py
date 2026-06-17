import pytest

import app.tools.ask_user as ask_user_module
from agentlang.context.tool_context import ToolContext
from app.core.context.execution_source import SuperMagicExecutionSource
from app.tools.ask_user import (
    ASK_USER_POLICY_SKIP_SECONDS,
    ASK_USER_TIMEOUT_DEFAULT_SECONDS,
    ASK_USER_TIMEOUT_MAX_SECONDS,
    ASK_USER_TIMEOUT_MIN_SECONDS,
    AskUserTool,
    build_ask_user_result_builder,
)


def _tool_context(timeout: int) -> ToolContext:
    return ToolContext(
        tool_call_id="call_mock",
        tool_name="ask_user",
        arguments={
            "questions": '<question type="confirm">继续吗？</question>',
            "timeout": timeout,
        },
    )


@pytest.mark.asyncio
async def test_ask_user_clamps_timeout_to_ten_to_thirty_minutes(monkeypatch):
    monkeypatch.setattr(ask_user_module.time, "time", lambda: 1000)
    tool = AskUserTool()
    monkeypatch.setattr(
        AskUserTool,
        "_get_execution_source",
        staticmethod(lambda _: SuperMagicExecutionSource.HUMAN_CHAT),
    )

    too_short = _tool_context(60)
    await tool.set_extra_arguments(too_short)
    assert too_short.arguments["expires_at"] == 1000 + ASK_USER_TIMEOUT_MIN_SECONDS
    assert too_short.arguments["ask_user_policy_blocked"] is False

    within_range = _tool_context(1200)
    await tool.set_extra_arguments(within_range)
    assert within_range.arguments["expires_at"] == 1000 + 1200

    too_long = _tool_context(3600)
    await tool.set_extra_arguments(too_long)
    assert too_long.arguments["expires_at"] == 1000 + ASK_USER_TIMEOUT_MAX_SECONDS


@pytest.mark.asyncio
async def test_ask_user_policy_block_sets_one_second_expiry(monkeypatch):
    monkeypatch.setattr(ask_user_module.time, "time", lambda: 1000)
    tool = AskUserTool()
    monkeypatch.setattr(
        AskUserTool,
        "_get_execution_source",
        staticmethod(lambda _: SuperMagicExecutionSource.CRON),
    )
    context = _tool_context(ASK_USER_TIMEOUT_DEFAULT_SECONDS)

    await tool.set_extra_arguments(context)
    tool_data = tool.build_tool_data(context)

    assert context.arguments["expires_at"] == 1000 + ASK_USER_POLICY_SKIP_SECONDS
    assert context.arguments["ask_user_policy_blocked"] is True
    assert context.arguments["ask_user_policy_source"] == SuperMagicExecutionSource.CRON.value
    assert tool_data["policy_blocked"] is True
    assert tool_data["policy_source"] == SuperMagicExecutionSource.CRON.value


def test_ask_user_policy_block_result_guides_model():
    result_builder = build_ask_user_result_builder(
        [],
        policy_blocked=True,
        policy_source=SuperMagicExecutionSource.MESSAGE_SCHEDULE.value,
    )

    content, extra_info = result_builder("timeout", "{}")

    assert "Ask User is unavailable" in content
    assert "do not wait for a user answer" in content
    assert extra_info["policy_blocked"] is True
    assert extra_info["policy_source"] == SuperMagicExecutionSource.MESSAGE_SCHEDULE.value
