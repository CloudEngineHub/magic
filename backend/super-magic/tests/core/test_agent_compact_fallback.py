from types import SimpleNamespace

import pytest

from agentlang.exceptions import ResourceLimitExceededException
from agentlang.chat_history import CompactionConfig
from agentlang.llms.factory import LLMFactory
from app.core import ai_abilities
from app.core.models.agent_model_context import AgentModelContext
from app.core.models.agent_model_selection import AgentModelSelection

import app.service  # noqa: F401  # Ensure service package finishes initialization before importing Agent.
from app.magic.background_compact import (
    BackgroundCompactState,
    build_messages_digest,
    start_background_compact,
)
from app.magic.agent import Agent, AgentLoopState


class _FakeCompactAgent:
    _PROVIDER_RATE_LIMIT_STATUS_CODES = Agent._PROVIDER_RATE_LIMIT_STATUS_CODES
    _NON_RETRYABLE_STATUS_CODES = Agent._NON_RETRYABLE_STATUS_CODES
    _PROGRESSIVE_RECOVERY_PROMPTS = Agent._PROGRESSIVE_RECOVERY_PROMPTS
    _call_llm_with_retry = Agent._call_llm_with_retry
    _try_fallback_compact_model_once = Agent._try_fallback_compact_model_once
    _restore_pre_compact_model = Agent._restore_pre_compact_model

    def __init__(self, failures: list[Exception]):
        model_context = AgentModelContext()
        model_context.apply_selection(AgentModelSelection(
            configured_text_model_id="mock-default-text",
            text_model_id="mock-runtime-text",
        ))
        model_context.activate_compact_text_model("mock-compact-text")

        self.agent_context = SimpleNamespace(model_context=model_context)
        self.llm_id = "mock-default-text"
        self.failures = list(failures)
        self.calls: list[dict[str, object]] = []
        self.recovery_messages: list[str] = []

    async def _prepare_and_call_llm(self, **kwargs):
        self.calls.append({
            "use_stream": kwargs.get("use_stream"),
            "non_stream_timeout": kwargs.get("non_stream_timeout"),
            "model_id": self.agent_context.model_context.current_text_model_id,
        })
        if self.failures:
            raise self.failures.pop(0)
        return SimpleNamespace(content="mock compact result")

    def _find_context_window_error(self, exception: Exception):
        return None

    def _extract_chunk_count(self, exception: Exception) -> int:
        return 0

    async def _try_inject_output_recovery_message(self, loop_state, prompt: str, source: str) -> bool:
        self.recovery_messages.append(source)
        return True

    async def _interruptible_sleep(self, seconds: float) -> None:
        return None

    def _log_compaction_event(self, event_type: str, message: str) -> None:
        return None


class _FakeForceCompactAgent:
    _has_pending_compact_request = Agent._has_pending_compact_request
    _try_compact_chat_history_force = Agent._try_compact_chat_history_force

    def __init__(self):
        self.build_called = False
        self._compact_request_pending_llm_call = True
        self._bg_compact_state = BackgroundCompactState()
        self.chat_history = SimpleNamespace(
            messages=[
                SimpleNamespace(content="mock user message"),
                SimpleNamespace(content="mock assistant message"),
                SimpleNamespace(content="mock tool result"),
                SimpleNamespace(content="mock latest message"),
            ]
        )

    def _build_compact_request(self) -> str:
        self.build_called = True
        return "mock compact request"


class _FakeLoopCompactAgent:
    _has_pending_compact_request = Agent._has_pending_compact_request
    _mark_compact_request_pending_llm_call = Agent._mark_compact_request_pending_llm_call
    _clear_compact_request_pending_llm_call = Agent._clear_compact_request_pending_llm_call
    _restore_pre_compact_model = Agent._restore_pre_compact_model
    _restore_stale_compact_model_before_loop = Agent._restore_stale_compact_model_before_loop

    def __init__(self, last_content: str, compact_request_pending: bool = False):
        model_context = AgentModelContext()
        model_context.apply_selection(AgentModelSelection(
            configured_text_model_id="mock-default-text",
            text_model_id="mock-runtime-text",
        ))
        model_context.activate_compact_text_model("mock-compact-text")

        self.agent_context = SimpleNamespace(model_context=model_context)
        self.llm_id = "mock-default-text"
        self.chat_history = SimpleNamespace(messages=[SimpleNamespace(content=last_content)])
        self._compact_request_pending_llm_call = compact_request_pending

    def _log_compaction_event(self, event_type: str, message: str) -> None:
        return None


class _FakeChatHistory:
    def __init__(self, messages: list[SimpleNamespace], token_count: int):
        self.messages = messages
        self.token_count = token_count
        self.added_messages: list[object] = []
        self.replacement_messages: list[object] | None = None

    async def tokens_count(self) -> int:
        return self.token_count

    async def add_message(self, message: object) -> None:
        self.added_messages.append(message)
        self.messages.append(message)

    async def replace_messages(self, messages: list[object]) -> None:
        self.replacement_messages = messages
        self.messages = messages


class _FakePrecompactAgent:
    _try_compact_chat_history = Agent._try_compact_chat_history
    _trigger_foreground_compact = Agent._trigger_foreground_compact
    _has_pending_compact_request = Agent._has_pending_compact_request
    _mark_compact_request_pending_llm_call = Agent._mark_compact_request_pending_llm_call

    def __init__(self, token_count: int, *, pending: bool = False):
        self.llm_id = "mock-default-text"
        self.agent_context = SimpleNamespace(
            model_context=SimpleNamespace(current_text_model_id="mock-runtime-text")
        )
        self.compaction_config = CompactionConfig(
            token_threshold=100,
            min_token_threshold=0,
            early_compact_ratio=0.8,
            max_conversation_rounds=100,
        )
        self.chat_history = _FakeChatHistory(
            messages=[
                SimpleNamespace(role="system", content="system", show_in_ui=False),
                SimpleNamespace(role="user", content="question", show_in_ui=True),
                SimpleNamespace(role="assistant", content="answer", show_in_ui=True),
            ],
            token_count=token_count,
        )
        self._bg_compact_state = BackgroundCompactState()
        self._compact_request_pending_llm_call = pending
        self.background_start_count = 0
        self.built_compact_request = False

    async def _start_background_compact(self) -> None:
        self.background_start_count += 1

    def _build_compact_request(self) -> str:
        self.built_compact_request = True
        return "mock compact request"

    def _log_compaction_event(self, event_type: str, message: str) -> None:
        return None


class _FakeRunningBackgroundState:
    is_completed = False
    is_running = True
    is_idle = False
    elapsed_seconds = 1.25

    def __init__(self):
        self.reset_count = 0

    def reset(self) -> None:
        self.reset_count += 1


class _FakeHardThresholdAgent(_FakePrecompactAgent):
    def __init__(self):
        super().__init__(token_count=120)
        self._bg_compact_state = _FakeRunningBackgroundState()
        self.wait_count = 0
        self.applied_summary: str | None = None
        self.foreground_count = 0

    async def _wait_for_background_compact(self) -> str:
        self.wait_count += 1
        return "captured background summary"

    async def _apply_background_compact(self, summary: str) -> bool:
        self.applied_summary = summary
        return True

    async def _trigger_foreground_compact(
        self,
        token_count: int,
        token_threshold: int,
        message_count: int,
    ) -> bool:
        self.foreground_count += 1
        return True


class _FakeTimedOutBackgroundAgent(_FakeHardThresholdAgent):
    async def _wait_for_background_compact(self) -> None:
        self.wait_count += 1
        return None


class _FakeHorizon:
    def __init__(self):
        self.reset_count = 0

    async def on_context_reset(self) -> None:
        self.reset_count += 1


class _FakeAgentContext:
    def __init__(self):
        self.horizon = _FakeHorizon()
        self.blocker_count = 0

    def increment_cancel_blocker(self) -> None:
        self.blocker_count += 1

    def decrement_cancel_blocker(self) -> None:
        self.blocker_count -= 1


class _FakeApplyBackgroundAgent:
    _build_compacted_summary_message = Agent._build_compacted_summary_message
    _apply_background_compact = Agent._apply_background_compact

    def __init__(self):
        self.system_prompt = "system prompt"
        self.agent_context = _FakeAgentContext()
        self.backup_count = 0
        self.rehydrate_count = 0
        self.snapshot_messages = [
            SimpleNamespace(role="system", content="system", show_in_ui=False),
            SimpleNamespace(role="user", content="before compact", show_in_ui=True),
        ]
        self.new_message = SimpleNamespace(
            role="user",
            content="message after background snapshot",
            show_in_ui=True,
        )
        self.chat_history = _FakeChatHistory(
            messages=[*self.snapshot_messages, self.new_message],
            token_count=150,
        )
        self._bg_compact_state = BackgroundCompactState(
            snapshot_message_count=len(self.snapshot_messages),
            snapshot_digest=build_messages_digest(self.snapshot_messages),
        )

    async def _backup_before_compact(self) -> None:
        self.backup_count += 1

    async def _rehydrate_media_models_after_context_reset(self) -> None:
        self.rehydrate_count += 1


@pytest.mark.asyncio
async def test_compact_model_failure_falls_back_to_runtime_model_once():
    agent = _FakeCompactAgent([RuntimeError("mock compact model blocked")])

    result = await agent._call_llm_with_retry(AgentLoopState())

    assert result.content == "mock compact result"
    assert [call["model_id"] for call in agent.calls] == [
        "mock-compact-text",
        "mock-runtime-text",
    ]
    assert agent.calls[0]["use_stream"] is True
    assert agent.calls[1]["use_stream"] is False
    assert not agent.agent_context.model_context.has_active_compact_text_model()


@pytest.mark.asyncio
async def test_compact_model_fallback_is_not_repeated_after_runtime_failure():
    agent = _FakeCompactAgent([
        RuntimeError("mock compact model blocked"),
        RuntimeError("mock runtime model failed"),
    ])

    with pytest.raises(RuntimeError, match="mock runtime model failed"):
        await agent._call_llm_with_retry(AgentLoopState())

    assert [call["model_id"] for call in agent.calls] == [
        "mock-compact-text",
        "mock-runtime-text",
    ]
    assert not agent.agent_context.model_context.has_active_compact_text_model()


@pytest.mark.asyncio
async def test_compact_model_resource_limit_does_not_fallback():
    agent = _FakeCompactAgent([ResourceLimitExceededException(error_code=12000)])

    with pytest.raises(ResourceLimitExceededException):
        await agent._call_llm_with_retry(AgentLoopState())

    assert [call["model_id"] for call in agent.calls] == ["mock-compact-text"]
    assert agent.agent_context.model_context.has_active_compact_text_model()


@pytest.mark.asyncio
async def test_reactive_compact_skips_duplicate_pending_request():
    agent = _FakeForceCompactAgent()

    assert not await agent._try_compact_chat_history_force()
    assert not agent.build_called


def test_pending_compact_request_keeps_compact_model_before_loop():
    agent = _FakeLoopCompactAgent("mock latest message", compact_request_pending=True)

    agent._restore_stale_compact_model_before_loop()

    model_context = agent.agent_context.model_context
    assert model_context.has_active_compact_text_model()
    assert model_context.current_text_model_id == "mock-compact-text"


def test_compact_pending_does_not_depend_on_last_message_content():
    agent = _FakeLoopCompactAgent("must call compact_chat_history now")

    assert not agent._has_pending_compact_request()


def test_pending_compact_flag_keeps_model_even_when_last_message_changes():
    agent = _FakeLoopCompactAgent("mock latest message after command processing", compact_request_pending=True)

    agent._restore_stale_compact_model_before_loop()

    model_context = agent.agent_context.model_context
    assert model_context.has_active_compact_text_model()
    assert model_context.current_text_model_id == "mock-compact-text"
    agent._clear_compact_request_pending_llm_call()
    assert not agent._has_pending_compact_request()


def test_stale_compact_model_restores_before_loop_without_pending_request():
    agent = _FakeLoopCompactAgent("mock assistant used another tool")

    agent._restore_stale_compact_model_before_loop()

    model_context = agent.agent_context.model_context
    assert not model_context.has_active_compact_text_model()
    assert model_context.current_text_model_id == "mock-runtime-text"


def test_compact_model_validation_does_not_use_llm_fallback(monkeypatch: pytest.MonkeyPatch):
    calls: list[bool] = []

    monkeypatch.setattr(
        ai_abilities,
        "get_ability_config",
        lambda ability, key, default=None: "missing-compact-model",
    )

    def fake_get_model_config(
        model_id: str,
        expected_type: str | None = None,
        allow_fallback: bool = True,
    ):
        calls.append(allow_fallback)
        if allow_fallback:
            return SimpleNamespace(
                model_id="auto",
                provider="openai",
                name="auto",
                api_key="mock-api-key",
                api_base_url="https://llm.example.com/v1",
            )
        raise ValueError(f"missing exact model: {model_id}")

    monkeypatch.setattr(LLMFactory, "get_model_config", fake_get_model_config)

    assert ai_abilities.get_compact_model_id() is None
    assert calls == [False]


@pytest.mark.asyncio
async def test_precompact_starts_background_at_early_threshold_without_injecting_request():
    agent = _FakePrecompactAgent(token_count=90)

    assert not await agent._try_compact_chat_history()

    assert agent.background_start_count == 1
    assert not agent.built_compact_request
    assert not agent.chat_history.added_messages


@pytest.mark.asyncio
async def test_precompact_does_not_start_background_when_pending_compact_request_exists():
    agent = _FakePrecompactAgent(token_count=120, pending=True)

    assert not await agent._try_compact_chat_history()

    assert agent.background_start_count == 0
    assert not agent.built_compact_request
    assert not agent.chat_history.added_messages


@pytest.mark.asyncio
async def test_hard_threshold_waits_for_running_background_compact_before_foreground_injection():
    agent = _FakeHardThresholdAgent()

    assert await agent._try_compact_chat_history()

    assert agent.wait_count == 1
    assert agent.applied_summary == "captured background summary"
    assert agent.foreground_count == 0
    assert agent._bg_compact_state.reset_count == 0


@pytest.mark.asyncio
async def test_hard_threshold_falls_back_to_foreground_when_background_compact_times_out():
    agent = _FakeTimedOutBackgroundAgent()

    assert await agent._try_compact_chat_history()

    assert agent.wait_count == 1
    assert agent.applied_summary is None
    assert agent.foreground_count == 1
    assert agent._bg_compact_state.reset_count == 1


@pytest.mark.asyncio
async def test_apply_background_compact_preserves_messages_after_snapshot():
    agent = _FakeApplyBackgroundAgent()

    assert await agent._apply_background_compact("summarized history")

    replacement = agent.chat_history.replacement_messages
    assert replacement is not None
    assert [message.role for message in replacement] == ["system", "user", "user"]
    assert "summarized history" in replacement[1].content
    assert replacement[2] is agent.new_message
    assert agent.backup_count == 1
    assert agent.agent_context.horizon.reset_count == 1
    assert agent.rehydrate_count == 1
    assert agent.agent_context.blocker_count == 0
    assert agent._bg_compact_state.is_idle


@pytest.mark.asyncio
async def test_apply_background_compact_rejects_changed_snapshot_prefix():
    agent = _FakeApplyBackgroundAgent()
    agent.chat_history.messages[1] = SimpleNamespace(
        role="user",
        content="rewritten before compact",
        show_in_ui=True,
    )

    assert not await agent._apply_background_compact("summarized history")

    assert agent.chat_history.replacement_messages is None
    assert agent.backup_count == 0
    assert agent.agent_context.horizon.reset_count == 0
    assert agent.rehydrate_count == 0
    assert agent.agent_context.blocker_count == 0
    assert agent._bg_compact_state.is_idle


@pytest.mark.asyncio
async def test_start_background_compact_forks_isolated_agent_and_captures_summary(monkeypatch):
    calls: list[dict[str, object]] = []

    async def fake_run_isolated_agent(**kwargs) -> str:
        calls.append(kwargs)
        return "summary from forked compact agent"

    monkeypatch.setattr(
        "app.service.agent_runner.run_isolated_agent",
        fake_run_isolated_agent,
    )
    state = BackgroundCompactState()
    messages = [
        SimpleNamespace(role="system", content="system", show_in_ui=False),
        SimpleNamespace(role="user", content="question", show_in_ui=True),
    ]
    chat_history = _FakeChatHistory(messages=messages, token_count=90)
    registered_cleanups: dict[str, object] = {}
    agent_context = SimpleNamespace(
        context_id="parent-context",
        register_run_cleanup=lambda key, callback: registered_cleanups.update({key: callback}),
    )

    await start_background_compact(
        state=state,
        agent_name="mock-agent",
        agent_context=agent_context,
        chat_history=chat_history,
        compact_instruction="Use a complete summary.",
        model_id="mock-compact-model",
    )

    assert state.snapshot_message_count == len(messages)
    assert state.snapshot_digest == build_messages_digest(messages)
    assert state._task is not None
    assert await state._task == "summary from forked compact agent"
    assert state.get_summary() == "summary from forked compact agent"
    assert len(calls) == 1
    assert calls[0]["agent_name"] == "mock-agent"
    assert calls[0]["parent_context"] is agent_context
    assert calls[0]["fork_source_chat_history"] is chat_history
    assert calls[0]["model_id"] == "mock-compact-model"
    assert calls[0]["disable_compaction"] is True
    assert calls[0]["capture_compact_history_result"] is True
    assert registered_cleanups


@pytest.mark.asyncio
async def test_start_background_compact_skips_failed_snapshot_without_forking(monkeypatch):
    calls: list[dict[str, object]] = []

    async def fake_run_isolated_agent(**kwargs) -> str:
        calls.append(kwargs)
        return "summary should not be used"

    monkeypatch.setattr(
        "app.service.agent_runner.run_isolated_agent",
        fake_run_isolated_agent,
    )
    messages = [
        SimpleNamespace(role="system", content="system", show_in_ui=False),
        SimpleNamespace(role="user", content="question", show_in_ui=True),
    ]
    state = BackgroundCompactState(
        generation="failed-generation",
        snapshot_message_count=len(messages),
        snapshot_digest=build_messages_digest(messages),
    )
    state.mark_failed()
    chat_history = _FakeChatHistory(messages=messages, token_count=90)
    agent_context = SimpleNamespace(
        context_id="parent-context",
        register_run_cleanup=lambda key, callback: None,
    )

    await start_background_compact(
        state=state,
        agent_name="mock-agent",
        agent_context=agent_context,
        chat_history=chat_history,
        compact_instruction="Use a complete summary.",
        model_id="mock-compact-model",
    )

    assert calls == []
    assert state.is_idle
