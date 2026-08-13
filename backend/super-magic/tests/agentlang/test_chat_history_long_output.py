import pytest

from agentlang.chat_history.chat_history import ChatHistory, _MSG_CONTENT_TOKEN_LIMIT
from agentlang.chat_history.chat_history_models import AssistantMessage


@pytest.mark.asyncio
async def test_append_assistant_message_keeps_content_below_safety_limit(monkeypatch):
    captured: list[AssistantMessage] = []
    chat_history = ChatHistory.__new__(ChatHistory)

    async def capture_message(message):
        captured.append(message)
        return False

    monkeypatch.setattr(chat_history, "add_message", capture_message)
    monkeypatch.setattr(
        "agentlang.chat_history.chat_history.num_tokens_from_string",
        lambda content: _MSG_CONTENT_TOKEN_LIMIT,
    )

    await chat_history.append_assistant_message("valid bounded output")

    assert captured[0].content == "valid bounded output"


@pytest.mark.asyncio
async def test_append_assistant_message_still_truncates_degenerate_output(monkeypatch):
    captured: list[AssistantMessage] = []
    chat_history = ChatHistory.__new__(ChatHistory)

    async def capture_message(message):
        captured.append(message)
        return False

    monkeypatch.setattr(chat_history, "add_message", capture_message)
    monkeypatch.setattr(
        "agentlang.chat_history.chat_history.num_tokens_from_string",
        lambda content: _MSG_CONTENT_TOKEN_LIMIT + 1,
    )

    await chat_history.append_assistant_message("looping output")

    assert "<system_content_truncation>" in captured[0].content
