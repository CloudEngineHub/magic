import pytest

from agentlang.chat_history.chat_history import ChatHistory
from agentlang.chat_history.chat_history_models import (
    AssistantMessage,
    SystemMessage,
    UserMessage,
)
from app.utils.async_file_utils import async_read_json, async_write_json


class _EventDispatcher:
    async def dispatch(self, _event) -> None:
        return None


@pytest.mark.asyncio
async def test_chat_history_save_and_load_keep_existing_message_format(tmp_path):
    history = ChatHistory("test-agent", "agent-1", str(tmp_path), _EventDispatcher())
    history.messages = [
        SystemMessage(content="system", created_at="2026-07-24 00:00:00"),
        UserMessage(content="question", created_at="2026-07-24 00:00:01"),
        AssistantMessage(
            content="answer",
            created_at="2026-07-24 00:00:02",
            duration_ms=1_500,
        ),
    ]

    await history.save()

    document = await async_read_json(history._history_file_path)
    assert "id" not in document[0]
    assert "duration_ms" not in document[2]
    assert document[2]["duration"] == "1.500s"

    loaded = ChatHistory("test-agent", "agent-1", str(tmp_path), _EventDispatcher())
    await loaded.load()
    assert [message.content for message in loaded.messages] == ["system", "question", "answer"]


@pytest.mark.asyncio
async def test_chat_history_load_does_not_activate_unused_duration_conversion(tmp_path):
    history = ChatHistory("test-agent", "agent-1", str(tmp_path), _EventDispatcher())
    await async_write_json(
        history._history_file_path,
        [
            {
                "timestamp": "2026-07-24 00:00:00",
                "role": "assistant",
                "content": "answer",
                "show_in_ui": True,
                "duration": "1.50s",
            }
        ],
    )

    last_message = await history.load_last_message_from_disk()

    assert isinstance(last_message, AssistantMessage)
    assert last_message.duration_ms is None
