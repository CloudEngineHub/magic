import pytest

from agentlang.agent.models import AgentRunRequest
from agentlang.chat_history.chat_history import ChatHistory
from agentlang.chat_history.chat_history_models import (
    AssistantMessage,
    SystemMessage,
    UserMessage,
    UserMessageContentPart,
)
from app.utils.async_file_utils import async_read_json, async_write_json


class _EventDispatcher:
    async def dispatch(self, _event) -> None:
        return None


@pytest.mark.asyncio
async def test_chat_history_save_and_load_keep_existing_message_format(tmp_path):
    history_dir = tmp_path / "chat_history"
    history = ChatHistory("test-agent", "agent-1", str(history_dir), _EventDispatcher())
    assert not history_dir.exists()
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

    loaded = ChatHistory("test-agent", "agent-1", str(history_dir), _EventDispatcher())
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


@pytest.mark.asyncio
async def test_chat_history_persists_normalized_image_refs_and_loads_legacy_text(tmp_path):
    history = ChatHistory("test-agent", "agent-1", str(tmp_path), _EventDispatcher())
    history.messages = [
        UserMessage(
            content="Inspect image",
            content_parts=[
                UserMessageContentPart.text_part("Inspect image"),
                UserMessageContentPart.image_ref("uploads/image.png"),
            ],
        )
    ]

    await history.save()
    loaded = ChatHistory("test-agent", "agent-1", str(tmp_path), _EventDispatcher())
    await loaded.load()

    assert isinstance(loaded.messages[0], UserMessage)
    assert loaded.messages[0].content_parts == [
        UserMessageContentPart.text_part("Inspect image"),
        UserMessageContentPart.image_ref("uploads/image.png"),
    ]


def test_user_message_rejects_malformed_content_parts():
    """新格式历史中的非法内容片段不应被静默丢弃。"""
    with pytest.raises(TypeError, match="content_parts must be a list"):
        UserMessage.from_dict({"content": "Inspect image", "content_parts": {}})

    with pytest.raises(TypeError, match="content part must be a dictionary"):
        UserMessage.from_dict({"content": "Inspect image", "content_parts": ["image.png"]})


def test_chat_history_message_snapshot_is_immutable(tmp_path):
    """应用层获取的消息快照不应随 ChatHistory 后续写入而变化。"""
    history = ChatHistory("test-agent", "agent-1", str(tmp_path), _EventDispatcher())
    history.messages = [UserMessage(content="first")]

    snapshot = history.get_message_snapshot()
    history.messages.append(UserMessage(content="second"))

    assert isinstance(snapshot, tuple)
    assert [message.content for message in snapshot] == ["first"]


@pytest.mark.asyncio
async def test_chat_history_appends_normalized_agent_run_request(tmp_path):
    """ChatHistory 应直接持久化应用层已经规范化的运行请求。"""
    history = ChatHistory(
        "test-agent",
        "agent-1",
        str(tmp_path / "chat_history"),
        _EventDispatcher(),
    )

    await history.append_user_query(
        AgentRunRequest(
            query="Inspect image",
            image_refs=["images/mock.png"],
        )
    )

    assert isinstance(history.messages[0], UserMessage)
    assert history.messages[0].content_parts == [
        UserMessageContentPart.text_part("Inspect image"),
        UserMessageContentPart.image_ref("images/mock.png"),
    ]
