"""追加问题生成的触发、解析和单次模型调用。"""

import asyncio
from types import SimpleNamespace

import pytest

from agentlang.event.data import (
    AfterAgentLoopEventData,
    AfterMainAgentRunEventData,
    AgentLoopOutcome,
    BeforeMainAgentRunEventData,
    resolve_completed_loop_outcome,
)
from agentlang.event.event import Event, EventType
from agentlang.llms.factory import LLMClientConfig, LLMFactory
from app.core.entity.message.personal_preferences import PersonalPreferences
from app.service.follow_up_suggestion.listener import FollowUpSuggestionListener
from app.service.follow_up_suggestion.prompts import (
    FOLLOW_UP_SYSTEM_PROMPT,
    RESULT_TOOL_NAME,
    SUBMIT_FOLLOW_UP_SUGGESTIONS_TOOL,
)
from app.service.follow_up_suggestion.service import (
    STATUS_DONE,
    STATUS_FAILED,
    STATUS_GENERATING,
    FollowUpGenerationJob,
    FollowUpSuggestionService,
    parse_follow_up_arguments,
)
from app.infrastructure.sdk.magic_service.kernel.magic_service_parameter import MagicServiceAuthConfig
from app.infrastructure.sdk.magic_service.result.follow_up_suggestion_result import FollowUpSuggestionResult


def test_explicit_false_follow_up_preference_is_preserved():
    preferences = PersonalPreferences(show_follow_up_suggestions=False)

    assert preferences.show_follow_up_suggestions is False


@pytest.mark.parametrize("value", [None, "false", 0])
def test_invalid_follow_up_preference_defaults_enabled(value):
    preferences = PersonalPreferences(show_follow_up_suggestions=value)

    assert preferences.show_follow_up_suggestions is True


def test_completed_loop_outcome_priority():
    assert resolve_completed_loop_outcome(
        restored=True,
        waiting_for_user=True,
        maintenance=True,
    ) == AgentLoopOutcome.WAITING_FOR_USER
    assert resolve_completed_loop_outcome(
        restored=True,
        waiting_for_user=False,
        maintenance=True,
    ) == AgentLoopOutcome.MAINTENANCE
    assert resolve_completed_loop_outcome(
        restored=True,
        waiting_for_user=False,
        maintenance=False,
    ) == AgentLoopOutcome.RESTORED
    assert resolve_completed_loop_outcome(
        restored=False,
        waiting_for_user=False,
        maintenance=False,
    ) == AgentLoopOutcome.NORMAL


def test_parse_follow_up_arguments_cleans_blank_and_duplicate_items():
    assert parse_follow_up_arguments(
        '{"suggestions":[" 继续 ", "", "继续"]}'
    ) == ["继续"]


def test_model_prompt_asks_for_three_items_of_200_characters():
    suggestions = SUBMIT_FOLLOW_UP_SUGGESTIONS_TOOL["function"]["parameters"]["properties"]["suggestions"]

    assert "Prefer three questions." in FOLLOW_UP_SYSTEM_PROMPT
    assert suggestions["maxItems"] == 3
    assert suggestions["items"]["maxLength"] == 200


def test_parse_follow_up_arguments_skips_overlong_items_and_keeps_five():
    long_item = "问" * 201
    assert parse_follow_up_arguments(
        '{"suggestions":["一","' + long_item + '","二","三","四","五","六"]}'
    ) == ["一", "二", "三", "四", "五"]
    assert parse_follow_up_arguments(
        '{"suggestions":["' + long_item + '"]}'
    ) == []


class _RecordingService:
    def __init__(self):
        self.reasons = []

    async def generate(self, job):
        self.reasons.append(job)


def _context(task_id="100", enabled=True, state_holder=None):
    holder = state_holder if state_holder is not None else {}

    class Context:
        def __init__(self):
            self.cleanups = {}
            self.chat_history = SimpleNamespace(get_messages_for_llm=lambda: [{"role": "user", "content": "hello"}])

        def is_main_agent_context(self):
            return True

        def is_subagent_context(self):
            return False

        def get_task_id(self):
            return task_id

        def get_personal_preferences(self):
            return PersonalPreferences(show_follow_up_suggestions=enabled)

        def register_run_cleanup(self, key, handler):
            self.cleanups[key] = handler

        def get_chat_client_message(self):
            return SimpleNamespace(metadata=SimpleNamespace(
                user_id="user-1",
                organization_code="org-1",
                authorization="secret-token",
                topic_id="topic-1",
                chat_topic_id="chat-1",
                language="zh_CN",
            ))

    context = Context()
    holder["context"] = context
    return context


def _loop_event(context, index, effective, outcome):
    return Event(
        EventType.AFTER_AGENT_LOOP,
        AfterAgentLoopEventData.model_construct(
            agent_context=context,
            agent_name="main",
            loop_index=index,
            effective_loop_count=effective,
            outcome=outcome,
        ),
    )


def _before_event(context):
    return Event(
        EventType.BEFORE_MAIN_AGENT_RUN,
        BeforeMainAgentRunEventData.model_construct(
            agent_context=context,
            agent_name="main",
            query="q",
        ),
    )


def _after_event(context, agent_state):
    return Event(
        EventType.AFTER_MAIN_AGENT_RUN,
        AfterMainAgentRunEventData.model_construct(
            agent_context=context,
            agent_name="main",
            agent_state=agent_state,
            query="q",
        ),
    )


def test_listener_submits_once_at_threshold_and_ignores_duplicate_finish():
    service = _RecordingService()
    listener = FollowUpSuggestionListener(service)
    listener._min_effective_loops = lambda: 2
    listener._build_job = lambda context, reason: reason
    context = _context()

    async def scenario():
        await listener._handle_before_main_agent_run(_before_event(context))
        await listener._handle_after_agent_loop(_loop_event(context, 1, 1, AgentLoopOutcome.NORMAL))
        assert service.reasons == []
        await listener._handle_after_agent_loop(_loop_event(context, 2, 2, AgentLoopOutcome.NORMAL))
        await listener._background_task
        await listener._handle_after_agent_loop(_loop_event(context, 2, 2, AgentLoopOutcome.NORMAL))
        await listener._handle_after_main_agent_run(_after_event(context, "finished"))

    asyncio.run(scenario())
    assert service.reasons == ["threshold"]


def test_listener_finished_before_threshold_submits_and_waiting_does_not():
    service = _RecordingService()
    listener = FollowUpSuggestionListener(service)
    listener._min_effective_loops = lambda: 5
    listener._build_job = lambda context, reason: reason
    context = _context()

    async def scenario():
        await listener._handle_after_agent_loop(
            _loop_event(context, 1, 0, AgentLoopOutcome.WAITING_FOR_USER)
        )
        await listener._handle_after_main_agent_run(_after_event(context, "waiting_for_user"))
        assert service.reasons == []
        await listener._handle_after_main_agent_run(_after_event(context, "finished"))
        await listener._background_task

    asyncio.run(scenario())
    assert service.reasons == ["finished"]


def test_listener_disabled_preference_does_not_submit():
    service = _RecordingService()
    listener = FollowUpSuggestionListener(service)
    listener._min_effective_loops = lambda: 1
    listener._build_job = lambda context, reason: reason
    context = _context(enabled=False)

    async def scenario():
        await listener._handle_after_agent_loop(_loop_event(context, 1, 1, AgentLoopOutcome.NORMAL))
        await listener._handle_after_main_agent_run(_after_event(context, "finished"))

    asyncio.run(scenario())
    assert service.reasons == []


def _job():
    return FollowUpGenerationJob(
        task_id="100",
        trigger_reason="threshold",
        messages=[{"role": "user", "content": "hello"}],
        auth_config=MagicServiceAuthConfig(
            user_id="user-1",
            organization_code="org-1",
            user_authorization="secret-token",
        ),
        llm_config=LLMClientConfig(
            model_id="deepseek-v4-flash",
            api_key="test-key",
            name="deepseek-v4-flash",
            provider="test",
            supports_tool_use=True,
            extra_params={"tool_choice": "required", "n": 3},
        ),
        model_timeout_seconds=60,
        report_timeout_seconds=5,
    )


def _completion(arguments):
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(tool_calls=[
        SimpleNamespace(function=SimpleNamespace(name=RESULT_TOOL_NAME, arguments=arguments))
    ]))])


def test_service_calls_model_once_and_keeps_credentials_out_of_prompt(monkeypatch):
    calls = []
    reports = []

    async def fake_call(**kwargs):
        calls.append(kwargs)
        return _completion('{"suggestions":["下一步"]}')

    class FakeApi:
        async def report_async(self, parameter):
            reports.append(parameter.to_body())
            status = STATUS_GENERATING if parameter.status == STATUS_GENERATING else parameter.status
            return FollowUpSuggestionResult({
                "type": 1,
                "relation_id": "100",
                "status": status,
                "suggestions": parameter.suggestions or [],
            })

    monkeypatch.setattr(LLMFactory, "call_with_tool_support", fake_call)
    monkeypatch.setattr(
        "app.service.follow_up_suggestion.service.create_magic_service_sdk",
        lambda **kwargs: SimpleNamespace(follow_up_suggestion=FakeApi()),
    )

    asyncio.run(FollowUpSuggestionService().generate(_job()))

    assert len(calls) == 1
    assert calls[0]["agent_context"] is None
    assert calls[0]["enable_llm_response_events"] is False
    assert calls[0]["processor_config"].use_stream_mode is False
    assert "secret-token" not in calls[0]["messages"][1]["content"]
    assert [item["status"] for item in reports] == [STATUS_GENERATING, STATUS_DONE]


def test_service_does_not_call_model_again_after_invalid_output(monkeypatch):
    calls = []
    reports = []

    async def fake_call(**kwargs):
        calls.append(kwargs)
        return _completion("not-json")

    class FakeApi:
        async def report_async(self, parameter):
            reports.append(parameter.status)
            return FollowUpSuggestionResult({
                "type": 1,
                "relation_id": "100",
                "status": STATUS_GENERATING if parameter.status == STATUS_GENERATING else parameter.status,
                "suggestions": [],
            })

    monkeypatch.setattr(LLMFactory, "call_with_tool_support", fake_call)
    monkeypatch.setattr(
        "app.service.follow_up_suggestion.service.create_magic_service_sdk",
        lambda **kwargs: SimpleNamespace(follow_up_suggestion=FakeApi()),
    )

    asyncio.run(FollowUpSuggestionService().generate(_job()))

    assert len(calls) == 1
    assert reports == [STATUS_GENERATING, STATUS_FAILED]


def test_service_skips_model_when_storage_is_already_terminal(monkeypatch):
    calls = []

    async def fake_call(**kwargs):
        calls.append(kwargs)
        return _completion('{"suggestions":["下一步"]}')

    class FakeApi:
        async def report_async(self, parameter):
            return FollowUpSuggestionResult({
                "type": 1,
                "relation_id": "100",
                "status": STATUS_DONE,
                "suggestions": ["已有"],
            })

    monkeypatch.setattr(LLMFactory, "call_with_tool_support", fake_call)
    monkeypatch.setattr(
        "app.service.follow_up_suggestion.service.create_magic_service_sdk",
        lambda **kwargs: SimpleNamespace(follow_up_suggestion=FakeApi()),
    )

    asyncio.run(FollowUpSuggestionService().generate(_job()))

    assert calls == []
