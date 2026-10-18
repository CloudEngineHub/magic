import asyncio
import json
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from agentlang.context.tool_context import ToolContext
from app.tools import persona_chat as persona_chat_module
from app.tools.persona_chat import PersonaChat, PersonaChatParams


def _write_persona(root, persona_id, name):
    path = root / "personas" / f"{persona_id}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"schema_version": 1, "id": persona_id, "name": name, "tier": "generated"}),
        encoding="utf-8",
    )
    return f"personas/{persona_id}.json"


def _response(text):
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=text))])


class _FakeLLM:
    """记录每次调用的消息，并按人设名决定成功或失败。"""

    def __init__(self, failing_names=(), block=None):
        self.failing_names = set(failing_names)
        self.block = block
        self.calls = []
        self.configs = []

    def get_model_config(self, model_id):
        config = SimpleNamespace(model_id=model_id, max_output_tokens=4096)
        config.model_copy = lambda deep=True: SimpleNamespace(model_id=model_id, max_output_tokens=4096)
        return config

    async def call_with_tool_support(self, *, model_id, messages, llm_config, **kwargs):
        self.calls.append({"model_id": model_id, "messages": messages})
        self.configs.append(llm_config)
        if self.block is not None:
            await self.block.wait()
        user_prompt = messages[-1]["content"]
        name = user_prompt.rsplit("Now answer as ", 1)[-1].rstrip(".")
        if name in self.failing_names:
            raise RuntimeError(f"upstream provider 500 at internal-host for {name}")
        return _response(f"{name} answer")


@pytest.fixture
def fake_llm(monkeypatch):
    fake = _FakeLLM()
    monkeypatch.setattr(persona_chat_module, "LLMFactory", fake)
    monkeypatch.setattr(persona_chat_module, "get_ability_config", lambda *args, **kwargs: None)
    return fake


@pytest.fixture
def tool(tmp_path):
    return PersonaChat(base_dir=tmp_path)


def test_max_tokens_is_clamped_to_cost_limits():
    assert PersonaChatParams(persona_paths=["a.json"], question="q").max_tokens == 400
    assert PersonaChatParams(persona_paths=["a.json"], question="q", max_tokens=5000).max_tokens == 800
    assert PersonaChatParams(persona_paths=["a.json"], question="q", max_tokens=1).max_tokens == 100


def test_persona_count_must_be_between_one_and_six():
    with pytest.raises(ValidationError):
        PersonaChatParams(persona_paths=[], question="q")
    with pytest.raises(ValidationError):
        PersonaChatParams(persona_paths=[f"p{i}.json" for i in range(7)], question="q")


async def test_interview_answer_falls_back_to_auto_model_and_token_limit(tool, tmp_path, fake_llm):
    path = _write_persona(tmp_path, "p_zhang_1a2b", "Zhang")

    result = await tool.execute(
        ToolContext(), PersonaChatParams(persona_paths=[path], question="Why?", max_tokens=600)
    )

    assert result.ok is True
    assert result.data == {
        "answers": [{"persona_id": "p_zhang_1a2b", "name": "Zhang", "text": "Zhang answer"}],
        "failed": [],
    }
    assert "1 of 1 succeeded" in result.content
    assert "Zhang answer" in result.content
    assert fake_llm.calls[0]["model_id"] == "auto"
    assert fake_llm.configs[0].max_output_tokens == 600
    assert "one-on-one interview" in fake_llm.calls[0]["messages"][0]["content"]


async def test_interview_follows_current_text_model_when_unconfigured(tool, tmp_path, fake_llm):
    """未配置专属模型时用当前对话模型，避免 auto 不在用户套餐内导致访谈全部失败。"""
    path = _write_persona(tmp_path, "p_zhang_1a2b", "Zhang")
    tool_context = ToolContext()
    tool_context.register_extension(
        "agent_context",
        SimpleNamespace(
            model_context=SimpleNamespace(current_text_model_id="user-chosen-model"),
            get_interruption_event=lambda: None,
        ),
    )

    result = await tool.execute(tool_context, PersonaChatParams(persona_paths=[path], question="Why?"))

    assert result.ok is True
    assert fake_llm.calls[0]["model_id"] == "user-chosen-model"


async def test_configured_model_wins_over_current_text_model(tool, tmp_path, fake_llm, monkeypatch):
    monkeypatch.setattr(persona_chat_module, "get_ability_config", lambda *args, **kwargs: "persona-model")
    path = _write_persona(tmp_path, "p_zhang_1a2b", "Zhang")
    tool_context = ToolContext()
    tool_context.register_extension(
        "agent_context",
        SimpleNamespace(
            model_context=SimpleNamespace(current_text_model_id="user-chosen-model"),
            get_interruption_event=lambda: None,
        ),
    )

    await tool.execute(tool_context, PersonaChatParams(persona_paths=[path], question="Why?"))

    assert fake_llm.calls[0]["model_id"] == "persona-model"


async def test_persona_prompt_sets_cautious_baseline(tool, tmp_path, fake_llm):
    """受访者默认对新产品谨慎，不买、不换、不关心都是正常回答，避免讨好式夸赞。"""
    path = _write_persona(tmp_path, "p_zhang_1a2b", "Zhang")

    await tool.execute(ToolContext(), PersonaChatParams(persona_paths=[path], question="Would you buy it?"))

    system_prompt = fake_llm.calls[0]["messages"][0]["content"]
    assert "skeptical by default" in system_prompt
    assert "Not buying, not switching, or not caring is a normal answer" in system_prompt
    assert "Do not praise an idea to be polite" in system_prompt


@pytest.mark.parametrize("bad_path", ["../outside.json", "/etc/passwd"])
async def test_paths_outside_workspace_are_rejected(tool, tmp_path, fake_llm, bad_path):
    result = await tool.execute(ToolContext(), PersonaChatParams(persona_paths=[bad_path], question="q"))

    assert result.ok is False
    assert "outside the workspace" in result.content
    assert fake_llm.calls == []
    detail = await tool.get_tool_detail(ToolContext(), result, {"question": "q"})
    assert detail is not None
    assert "outside" not in detail.data.content


async def test_transcript_path_outside_workspace_is_rejected(tool, tmp_path, fake_llm):
    path = _write_persona(tmp_path, "p_zhang_1a2b", "Zhang")

    result = await tool.execute(
        ToolContext(),
        PersonaChatParams(persona_paths=[path], question="q", transcript_path="../../transcript.json"),
    )

    assert result.ok is False
    assert fake_llm.calls == []


async def test_focus_group_partial_failure_keeps_successful_answers(tool, tmp_path, fake_llm):
    fake_llm.failing_names = {"Li"}
    paths = [
        _write_persona(tmp_path, "p_zhang_1a2b", "Zhang"),
        _write_persona(tmp_path, "p_li_3c4d", "Li"),
        _write_persona(tmp_path, "p_wang_5e6f", "Wang"),
    ]

    result = await tool.execute(ToolContext(), PersonaChatParams(persona_paths=paths, question="Price?"))

    assert result.ok is False
    assert [answer["persona_id"] for answer in result.data["answers"]] == ["p_zhang_1a2b", "p_wang_5e6f"]
    assert result.data["failed"] == [
        {"persona_id": "p_li_3c4d", "path": "personas/p_li_3c4d.json", "reason": "model_error"}
    ]
    assert "2 of 3 succeeded" in result.content
    assert "p_li_3c4d" in result.content and "upstream provider 500" in result.content
    # 焦点小组按顺序回答：后发言者能看到本轮前面的回答。
    wang_prompt = fake_llm.calls[2]["messages"][-1]["content"]
    assert "Zhang: Zhang answer" in wang_prompt
    assert "focus group" in fake_llm.calls[2]["messages"][0]["content"]

    detail = await tool.get_tool_detail(ToolContext(), result, {"question": "Price?"})
    assert "Zhang answer" in detail.data.content
    assert "upstream" not in detail.data.content
    assert "internal-host" not in detail.data.content
    remark = await tool.get_after_tool_call_friendly_action_and_remark("persona_chat", ToolContext(), result, 0)
    assert remark["remark"]
    assert "upstream" not in remark["remark"]


async def test_missing_persona_file_is_reported_without_model_call(tool, tmp_path, fake_llm):
    (tmp_path / "personas").mkdir()

    result = await tool.execute(
        ToolContext(), PersonaChatParams(persona_paths=["personas/p_none_0000.json"], question="q")
    )

    assert result.ok is False
    assert result.data["answers"] == []
    assert result.data["failed"][0]["reason"] == "profile_unavailable"
    assert fake_llm.calls == []
    detail = await tool.get_tool_detail(ToolContext(), result, {"question": "q"})
    assert detail is not None and detail.data.content.strip()


async def test_transcript_is_used_as_context_and_missing_file_is_first_round(tool, tmp_path, fake_llm):
    path = _write_persona(tmp_path, "p_zhang_1a2b", "Zhang")
    transcript = tmp_path / "studies" / "s-1a2b" / "interviews" / "p_zhang_1a2b.json"
    transcript.parent.mkdir(parents=True)

    first = await tool.execute(
        ToolContext(),
        PersonaChatParams(persona_paths=[path], question="q1", transcript_path="studies/s-1a2b/interviews/p_zhang_1a2b.json"),
    )
    assert first.ok is True
    assert "does not exist yet" in first.content

    transcript.write_text(
        json.dumps({
            "schema_version": 1, "persona_id": "p_zhang_1a2b", "status": "running", "error": "",
            "rounds": [{"role": "moderator", "text": "Earlier question"}, {"role": "persona", "text": "Earlier answer"}],
        }),
        encoding="utf-8",
    )
    await tool.execute(
        ToolContext(),
        PersonaChatParams(persona_paths=[path], question="q2", transcript_path="studies/s-1a2b/interviews/p_zhang_1a2b.json"),
    )
    prompt = fake_llm.calls[-1]["messages"][-1]["content"]
    assert "Moderator: Earlier question" in prompt
    assert "Zhang: Earlier answer" in prompt


async def test_interruption_raises_cancelled_error(tool, tmp_path, fake_llm, monkeypatch):
    path = _write_persona(tmp_path, "p_zhang_1a2b", "Zhang")
    interrupt = asyncio.Event()
    fake_llm.block = asyncio.Event()  # 模型调用一直不返回，直到被中断
    keepalive = asyncio.create_task(asyncio.sleep(30))
    monkeypatch.setattr(persona_chat_module, "start_tool_keep_alive", lambda ctx: keepalive)
    context = ToolContext()
    context.register_extension(
        "agent_context",
        SimpleNamespace(get_interruption_event=lambda: interrupt, update_activity_time=lambda: None),
    )

    pending = asyncio.create_task(tool.execute(context, PersonaChatParams(persona_paths=[path], question="q")))
    while not fake_llm.calls:
        await asyncio.sleep(0.01)
    interrupt.set()

    with pytest.raises(asyncio.CancelledError):
        await asyncio.wait_for(pending, 1)
    await asyncio.sleep(0)
    assert keepalive.cancelled()
