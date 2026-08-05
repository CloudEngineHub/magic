import pytest

from app.core.entity.message.server_message import DisplayType
from app.tools.compact_chat_history import CompactChatHistory, CompactChatHistoryParams


@pytest.mark.asyncio
async def test_compact_chat_history_builds_frontend_detail():
    tool = CompactChatHistory()
    summary = "Mock compact summary for a long conversation."

    result = await tool.execute(None, CompactChatHistoryParams(summary=summary))
    final_summary = result.extra_info["summary"]
    detail = await tool.get_tool_detail(None, result, {"summary": summary})

    assert result.ok
    assert detail is not None
    assert detail.type == DisplayType.MD
    assert "对话内容已整理" in detail.data.content
    assert "压缩摘要" in detail.data.content
    assert str(len(final_summary)) in detail.data.content
    assert final_summary in detail.data.content


@pytest.mark.asyncio
async def test_compact_chat_history_rejects_blank_summary():
    tool = CompactChatHistory()

    result = await tool.execute(None, CompactChatHistoryParams(summary="  \n\t  "))

    assert not result.ok
    assert result.system is None
    assert "summary" in result.content.lower()
