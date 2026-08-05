from openai.types.chat.chat_completion_message import ChatCompletionMessage

from agentlang.event.reply_event_manager import ReplyEventManager


def test_build_final_message_preserves_complete_response():
    """V2 存在完整响应时应优先保留原始 Assistant message。"""
    original_message = ChatCompletionMessage(role="assistant", content="mock answer")
    setattr(original_message, "reasoning_content", "mock reasoning")

    final_message = ReplyEventManager._build_final_message(
        extracted_message=original_message,
        content="mock fallback",
        content_type="reasoning",
    )

    assert final_message is original_message
    assert final_message.content == "mock answer"
    assert final_message.reasoning_content == "mock reasoning"


def test_build_final_message_keeps_reasoning_field():
    """V2 字符串降级的 reasoning 应写入 reasoning_content。"""
    final_message = ReplyEventManager._build_final_message(
        extracted_message=None,
        content="mock reasoning",
        content_type="reasoning",
    )

    assert final_message.content is None
    assert final_message.reasoning_content == "mock reasoning"


def test_build_final_message_uses_content_for_content_type():
    """V2 普通正文降级应写入 content 字段。"""
    final_message = ReplyEventManager._build_final_message(
        extracted_message=None,
        content="mock answer",
        content_type="content",
    )

    assert final_message.content == "mock answer"


def test_build_final_message_keeps_v1_reasoning_transport_in_content():
    """V1 继续通过 content 字段传输 reasoning，并由 content_type 区分阶段。"""
    original_message = ChatCompletionMessage(role="assistant", content=None)
    setattr(original_message, "reasoning_content", "mock reasoning")

    final_message = ReplyEventManager._build_final_message(
        extracted_message=original_message,
        content="mock reasoning",
        content_type="reasoning",
        message_version="v1",
    )

    assert final_message is not original_message
    assert final_message.content == "mock reasoning"
