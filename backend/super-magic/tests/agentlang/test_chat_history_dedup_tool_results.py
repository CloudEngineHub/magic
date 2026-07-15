"""
测试 ChatHistory 同 tool_call_id 重复 tool_result 去重逻辑。

覆盖线上真实竞态：reload 时补入的合成占位 ToolMessage 与随后到达的真实工具
结果共存，导致同一 tool_call_id 出现多条内容不同的 ToolMessage，引发 LLM 400。

覆盖两条修复路径：
- _sanitize_duplicate_tool_results（load 时，强类型对象路径）
- _dedup_duplicate_tool_results（运行时 dict 路径，get_messages_for_llm 兜底）
"""
from agentlang.chat_history.chat_history import (
    ChatHistory,
    _is_synthetic_tool_result,
)
from agentlang.chat_history.chat_history_models import (
    AssistantMessage,
    FunctionCall,
    ToolCall,
    ToolMessage,
    UserMessage,
)

# ---------------------------------------------------------------------------
# 工厂函数
# ---------------------------------------------------------------------------

_PLACEHOLDER_A = "[Tool result missing — call was likely interrupted or truncated]"
_PLACEHOLDER_B = "[Tool result missing — call was likely truncated by output token limit]"


def _tc(id: str) -> dict:
    return {"id": id, "type": "function", "function": {"name": "f", "arguments": "{}"}}


def _asst(*ids: str) -> dict:
    return {"role": "assistant", "content": "", "tool_calls": [_tc(i) for i in ids]}


def _tool(id: str, content: str) -> dict:
    return {"role": "tool", "content": content, "tool_call_id": id}


def _user(c: str = "u") -> dict:
    return {"role": "user", "content": c}


def _typed_tc(id: str) -> ToolCall:
    return ToolCall(id=id, type="function", function=FunctionCall(name="f", arguments="{}"))


def _content_seq(messages) -> list:
    """提取 (role, tool_call_id, content) 序列，方便断言。"""
    seq = []
    for m in messages:
        tcid = m.get("tool_call_id") if isinstance(m, dict) else getattr(m, "tool_call_id", None)
        content = m.get("content") if isinstance(m, dict) else getattr(m, "content", None)
        role = m.get("role") if isinstance(m, dict) else getattr(m, "role", None)
        seq.append((role, tcid, content))
    return seq


# ---------------------------------------------------------------------------
# 辅助判断函数
# ---------------------------------------------------------------------------

def test_is_synthetic_tool_result_detects_both_variants():
    assert _is_synthetic_tool_result(_PLACEHOLDER_A)
    assert _is_synthetic_tool_result(_PLACEHOLDER_B)
    assert not _is_synthetic_tool_result("Swapped charts")
    assert not _is_synthetic_tool_result("")
    assert not _is_synthetic_tool_result(None)


# ---------------------------------------------------------------------------
# _dedup_duplicate_tool_results：运行时 dict 路径
# ---------------------------------------------------------------------------

def _dedup(messages: list) -> list:
    ch = ChatHistory.__new__(ChatHistory)
    return ch._dedup_duplicate_tool_results(messages)


def test_dedup_removes_synthetic_keeps_real_consecutive():
    """线上真实场景：占位紧跟真实结果，内容不同，旧去重规则漏掉。"""
    msgs = [
        _user(),
        _asst("A"),
        _tool("A", _PLACEHOLDER_A),
        _tool("A", "Swapped charts"),
    ]
    result = _dedup(msgs)
    assert _content_seq(result) == [
        ("user", None, "u"),
        ("assistant", None, ""),
        ("tool", "A", "Swapped charts"),
    ]


def test_dedup_removes_synthetic_when_real_comes_later_non_consecutive():
    """占位与真实结果之间隔着其他消息也能去重（全局按 id 分组）。"""
    msgs = [
        _asst("A"),
        _tool("A", _PLACEHOLDER_A),
        _user("h"),
        _tool("A", "real result A"),
    ]
    result = _dedup(msgs)
    assert _content_seq(result) == [
        ("assistant", None, ""),
        ("user", None, "h"),
        ("tool", "A", "real result A"),
    ]


def test_dedup_all_synthetic_keeps_last():
    """全是占位时保留最后一条（避免删空导致缺失 tool_result）。"""
    msgs = [
        _asst("A"),
        _tool("A", _PLACEHOLDER_A),
        _tool("A", _PLACEHOLDER_B),
    ]
    result = _dedup(msgs)
    assert _content_seq(result) == [
        ("assistant", None, ""),
        ("tool", "A", _PLACEHOLDER_B),
    ]


def test_dedup_multiple_real_keeps_last():
    """多个真实结果（理论不应发生）保留最后一条。"""
    msgs = [
        _asst("A"),
        _tool("A", "result 1"),
        _tool("A", "result 2"),
    ]
    result = _dedup(msgs)
    assert _content_seq(result) == [
        ("assistant", None, ""),
        ("tool", "A", "result 2"),
    ]


def test_dedup_preserves_unique_ids():
    """不同 tool_call_id 各自独立，互不影响。"""
    msgs = [_asst("A", "B"), _tool("A", "rA"), _tool("B", "rB")]
    result = _dedup(msgs)
    assert result is msgs or len(result) == 3


def test_dedup_no_duplicates_returns_original():
    """无重复时直接返回原对象，零开销。"""
    msgs = [_asst("A"), _tool("A", "rA")]
    assert _dedup(msgs) is msgs


def test_dedup_empty_list():
    assert _dedup([]) == []


# ---------------------------------------------------------------------------
# _sanitize_duplicate_tool_results：load 时强类型路径
# ---------------------------------------------------------------------------

def _sanitize_typed(messages) -> tuple:
    ch = ChatHistory.__new__(ChatHistory)
    ch.messages = messages
    fixes = ch._sanitize_duplicate_tool_results()
    return ch.messages, fixes


def test_sanitize_typed_removes_synthetic_keeps_real():
    """线上竞态后的持久化历史：assistant + 占位 + 真实结果。"""
    messages, fixes = _sanitize_typed([
        UserMessage(content="u"),
        AssistantMessage(content="", tool_calls=[_typed_tc("A")]),
        ToolMessage(content=_PLACEHOLDER_A, tool_call_id="A"),
        ToolMessage(content="Swapped charts", tool_call_id="A"),
    ])
    assert fixes == 1
    assert len(messages) == 3
    assert messages[2].content == "Swapped charts"
    assert messages[2].tool_call_id == "A"


def test_sanitize_typed_all_synthetic_keeps_last():
    messages, fixes = _sanitize_typed([
        AssistantMessage(content="", tool_calls=[_typed_tc("A")]),
        ToolMessage(content=_PLACEHOLDER_A, tool_call_id="A"),
        ToolMessage(content=_PLACEHOLDER_B, tool_call_id="A"),
    ])
    assert fixes == 1
    assert len(messages) == 2
    assert messages[1].content == _PLACEHOLDER_B


def test_sanitize_typed_no_duplicates_zero_fixes():
    msgs = [
        AssistantMessage(content="", tool_calls=[_typed_tc("A")]),
        ToolMessage(content="rA", tool_call_id="A"),
    ]
    messages, fixes = _sanitize_typed(list(msgs))
    assert fixes == 0
    assert len(messages) == 2


# ---------------------------------------------------------------------------
# 集成：load 时 _sanitize_message_sequences 端到端
# ---------------------------------------------------------------------------

def _run_full_sanitize(messages) -> int:
    ch = ChatHistory.__new__(ChatHistory)
    ch.messages = messages
    return ch._sanitize_message_sequences()


def test_full_sanitize_handles_placeholder_plus_real():
    """端到端：占位 + 真实结果经过 5 条规则后只剩一条真实 tool_result，
    且紧随其 assistant（规则0 重排不会把真实结果挤走）。"""
    ch = ChatHistory.__new__(ChatHistory)
    ch.messages = [
        UserMessage(content="u"),
        AssistantMessage(content="", tool_calls=[_typed_tc("A")]),
        ToolMessage(content=_PLACEHOLDER_A, tool_call_id="A"),
        ToolMessage(content="Swapped charts", tool_call_id="A"),
    ]
    fixes = ch._sanitize_message_sequences()
    assert fixes > 0
    contents = [m.content for m in ch.messages]
    assert contents.count("Swapped charts") == 1
    assert _PLACEHOLDER_A not in contents
    # 重排后 assistant 紧跟 tool_result
    assert isinstance(ch.messages[1], AssistantMessage)
    assert isinstance(ch.messages[2], ToolMessage)
    assert ch.messages[2].content == "Swapped charts"
