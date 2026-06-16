from types import SimpleNamespace

import pytest
from agentlang.chat_history.session_config import SessionConfig
from agentlang.config.models.model_config import ModelConfig
from agentlang.config.models.model_config_manager import model_config_manager
from app.core.models.agent_model_selection import AgentModelSelection
from app.core.models.agent_model_context import AgentModelContext
from app.core.entity.message.client_message import ChatClientMessage
from app.service.agent_dispatcher import AgentDispatcher
from app.service.agent_runner import apply_isolated_agent_model_selection


def _chat_payload(**overrides):
    payload = {
        "message_id": "mock-message",
        "type": "chat",
        "prompt": "mock prompt",
    }
    payload.update(overrides)
    return payload


def test_chat_client_message_treats_blank_model_id_as_missing():
    assert ChatClientMessage(**_chat_payload()).model_id is None
    assert ChatClientMessage(**_chat_payload(model_id="")).model_id is None
    assert ChatClientMessage(**_chat_payload(model_id="   ")).model_id is None
    assert ChatClientMessage(**_chat_payload(model_id=" mock-model ")).model_id == "mock-model"


def test_last_dispatch_snapshot_drops_model_selection_fields():
    snapshot = {
        "message_id": "mock-message",
        "model_id": "mock-text-model",
        "dynamic_config": {
            "message_version": "v2",
            "image_model": {"model_id": "mock-image-model"},
            "video_model": {"model_id": "mock-video-model"},
        },
    }

    cleaned = AgentDispatcher._remove_model_selection_fields(snapshot)

    assert cleaned == {
        "message_id": "mock-message",
        "dynamic_config": {
            "message_version": "v2",
        },
    }


class _FakeChatHistory:
    def __init__(
        self,
        current: SessionConfig | None = None,
        last: SessionConfig | None = None,
    ) -> None:
        self._current = current or SessionConfig()
        self._last = last or SessionConfig()
        self.saved_configs: list[dict[str, object]] = []

    def get_current_session_config(self) -> SessionConfig:
        return self._current

    def get_last_session_config(self) -> SessionConfig:
        return self._last

    def save_session_config(
        self,
        model_id,
        image_model_id,
        image_model_sizes=None,
        video_model_id=None,
        video_generation_config=None,
        message_version=None,
        agent_mode=None,
        agent_code=None,
    ) -> None:
        self.saved_configs.append({
            "model_id": model_id,
            "image_model_id": image_model_id,
            "image_model_sizes": image_model_sizes,
            "video_model_id": video_model_id,
            "video_generation_config": video_generation_config,
            "message_version": message_version,
            "agent_mode": agent_mode,
            "agent_code": agent_code,
        })


class _FakeAgentContext:
    def __init__(self) -> None:
        self.model_context = AgentModelContext()
        self.runtime_model_id = None
        self.metadata = {}

    def set_runtime_model_id(self, model_id: str) -> None:
        self.runtime_model_id = model_id

    def get_runtime_model_id(self) -> str | None:
        return self.runtime_model_id

    def has_runtime_model_id(self) -> bool:
        return bool(self.runtime_model_id)

    def set_metadata(self, key: str, value: str) -> None:
        self.metadata[key] = value

    def get_message_version(self) -> str:
        return "v2"


def test_dispatcher_model_selection_works_without_agent_llm_id():
    agent = SimpleNamespace(
        chat_history=_FakeChatHistory(),
        agent_context=_FakeAgentContext(),
    )
    message = ChatClientMessage(**_chat_payload(model_id="mock-request-text"))

    dispatcher = AgentDispatcher.__new__(AgentDispatcher)
    dispatcher._apply_model_selection(message, agent)

    assert agent.agent_context.model_context.configured_text_model_id == "auto"
    assert agent.agent_context.model_context.current_text_model_id == "mock-request-text"
    assert agent.agent_context.runtime_model_id == "mock-request-text"
    assert agent.agent_context.metadata["runtime_model_source"] == "request"


def test_isolated_agent_model_selection_works_without_agent_llm_id():
    agent = SimpleNamespace(
        agent_name="mock-agent",
        chat_history=_FakeChatHistory(),
        agent_context=_FakeAgentContext(),
    )

    apply_isolated_agent_model_selection(
        agent=agent,
        model_id="mock-request-text",
    )

    assert agent.agent_context.model_context.configured_text_model_id == "auto"
    assert agent.agent_context.model_context.current_text_model_id == "mock-request-text"
    assert agent.agent_context.runtime_model_id == "mock-request-text"


def test_isolated_agent_inherits_parent_runtime_model_before_model_context():
    parent_context = _FakeAgentContext()
    parent_context.model_context.apply_selection(AgentModelSelection(
        configured_text_model_id="auto",
        text_model_id="stale-parent-text",
    ))
    parent_context.set_runtime_model_id("mock-runtime-text")

    agent = SimpleNamespace(
        agent_name="mock-agent",
        chat_history=_FakeChatHistory(),
        agent_context=_FakeAgentContext(),
    )

    apply_isolated_agent_model_selection(
        agent=agent,
        parent_context=parent_context,
    )

    assert agent.agent_context.model_context.current_text_model_id == "mock-runtime-text"
    assert agent.agent_context.runtime_model_id == "mock-runtime-text"


@pytest.mark.asyncio
async def test_save_session_config_persists_resolved_runtime_model_after_fallback():
    saved_models = dict(model_config_manager._models)
    try:
        model_config_manager._models = {
            "auto": ModelConfig.from_dict(
                "auto",
                {
                    "name": "deepseek-v4-flash",
                    "provider": "openai",
                    "api_key": "mock-key",
                    "api_base_url": "https://llm.example.com/v1",
                    "type": "llm",
                    "supports_tool_use": True,
                    "max_output_tokens": 131072,
                    "max_context_tokens": 1000000,
                    "temperature": 0.7,
                },
                provider_source="config.yaml",
            )
        }

        chat_history = _FakeChatHistory()
        agent_context = _FakeAgentContext()
        agent_context.model_context.apply_selection(AgentModelSelection(
            configured_text_model_id="auto",
            text_model_id="missing-model",
        ))
        agent_context.set_runtime_model_id("missing-model")
        agent = SimpleNamespace(chat_history=chat_history, agent_context=agent_context)
        message = ChatClientMessage(**_chat_payload(model_id="missing-model", update_session=True))

        await AgentDispatcher.__new__(AgentDispatcher)._save_session_config(message, agent)

        assert chat_history.saved_configs[-1]["model_id"] == "auto"
        assert agent_context.runtime_model_id == "auto"
        assert agent_context.model_context.current_text_model_id == "auto"
    finally:
        model_config_manager._models = saved_models


@pytest.mark.asyncio
async def test_save_session_config_warns_when_model_falls_back(monkeypatch):
    saved_models = dict(model_config_manager._models)
    try:
        model_config_manager._models = {
            "auto": ModelConfig.from_dict(
                "auto",
                {
                    "name": "deepseek-v4-flash",
                    "provider": "openai",
                    "api_key": "mock-key",
                    "api_base_url": "https://llm.example.com/v1",
                    "type": "llm",
                    "supports_tool_use": True,
                },
                provider_source="config.yaml",
            )
        }

        chat_history = _FakeChatHistory()
        agent_context = _FakeAgentContext()
        agent_context.model_context.apply_selection(AgentModelSelection(
            configured_text_model_id="auto",
            text_model_id="missing-model",
        ))
        agent_context.set_runtime_model_id("missing-model")
        agent = SimpleNamespace(chat_history=chat_history, agent_context=agent_context)
        message = ChatClientMessage(**_chat_payload(model_id="missing-model", update_session=True))
        warnings: list[str] = []
        monkeypatch.setattr(
            "app.service.agent_dispatcher.logger.warning",
            lambda message: warnings.append(message),
        )

        await AgentDispatcher.__new__(AgentDispatcher)._save_session_config(message, agent)

        warning_text = "\n".join(warnings)
        assert "会话模型保存前发生运行时模型降级" in warning_text
        assert "input=missing-model" in warning_text
        assert "resolved=auto" in warning_text
        assert "reason=模型不存在:missing-model" in warning_text
    finally:
        model_config_manager._models = saved_models
