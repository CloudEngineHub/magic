from types import SimpleNamespace

import pytest

from agentlang.chat_history.chat_history_models import UserMessage, UserMessageContentPart
from app.core.horizon.agent_horizon import AgentHorizon
from app.core.horizon.store import HorizonStore


class _FakeChatHistory:
    """只记录 Horizon 注入调用的最小聊天历史替身。"""

    def __init__(self) -> None:
        self.messages: list[UserMessage] = []

    async def add_message(self, message: UserMessage) -> None:
        """记录 Horizon 构造完成的 UserMessage 对象。"""
        self.messages.append(message)


@pytest.mark.asyncio
async def test_horizon_flushes_multiple_user_messages_in_order(tmp_path):
    """验证 Horizon 按登记顺序注入多个完整的 user 消息。"""
    history = _FakeChatHistory()
    context = SimpleNamespace(chat_history=history)
    horizon = AgentHorizon(
        HorizonStore(str(tmp_path), "magic", "agent-1"),
        "agent-1",
        context,
    )

    horizon.push_user_message(
        UserMessage(
            "分析这张图片",
            show_in_ui=False,
            source="native_visual",
            content_parts=[
                UserMessageContentPart.text_part("分析这张图片"),
                UserMessageContentPart.image_ref("images/chart.png"),
            ],
        )
    )
    horizon.push_user_message(
        UserMessage(
            "继续分析第二张图片",
            show_in_ui=False,
            source="native_visual",
            content_parts=[
                UserMessageContentPart.text_part("继续分析第二张图片"),
                UserMessageContentPart.image_ref("images/second.png"),
            ],
        )
    )
    assert len(horizon._pending_user_messages) == 2
    assert horizon._pending_user_messages[0].content == "分析这张图片"
    assert horizon._pending_user_messages[0].source == "native_visual"
    assert await horizon.flush_pending_user_messages() == 2
    assert len(history.messages) == 2
    message = history.messages[0]
    assert message.source == "native_visual"
    assert [part.path for part in message.content_parts[1:]] == ["images/chart.png"]
