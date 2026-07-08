from app.core.context.execution_source import (
    EXECUTION_SOURCE_DYNAMIC_CONFIG_KEY,
    SuperMagicExecutionSource,
    build_ask_user_policy_horizon_message,
    remove_execution_source_from_dynamic_config,
    resolve_execution_source,
)
from app.core.entity.message.client_message import ChatClientMessage, Metadata


def _message(**overrides):
    payload = {
        "message_id": "mock-message",
        "type": "chat",
        "prompt": "mock prompt",
    }
    payload.update(overrides)
    return ChatClientMessage(**payload)


def test_resolve_execution_source_prefers_explicit_dynamic_config():
    message = _message(
        dynamic_config={EXECUTION_SOURCE_DYNAMIC_CONFIG_KEY: "open_api"},
        metadata=Metadata(channel_name="wechat"),
    )

    assert resolve_execution_source(message) is SuperMagicExecutionSource.OPEN_API


def test_resolve_execution_source_blocks_invalid_explicit_source():
    message = _message(dynamic_config={EXECUTION_SOURCE_DYNAMIC_CONFIG_KEY: "typo"})

    assert resolve_execution_source(message) is SuperMagicExecutionSource.UNKNOWN


def test_resolve_execution_source_requires_explicit_python_direct_sources():
    im_message = _message(metadata=Metadata(channel_name="wechat"))
    cron_message = _message(message_id="cron_mock")
    legacy_http_message = _message()

    assert resolve_execution_source(im_message) is SuperMagicExecutionSource.HUMAN_CHAT
    assert resolve_execution_source(cron_message) is SuperMagicExecutionSource.HUMAN_CHAT
    assert resolve_execution_source(legacy_http_message) is SuperMagicExecutionSource.HUMAN_CHAT


def test_resolve_execution_source_reads_explicit_im_and_cron_sources():
    im_message = _message(
        dynamic_config={EXECUTION_SOURCE_DYNAMIC_CONFIG_KEY: "third_party_im"},
        metadata=Metadata(channel_name="wechat"),
    )
    cron_message = _message(
        message_id="cron_mock",
        dynamic_config={EXECUTION_SOURCE_DYNAMIC_CONFIG_KEY: "cron"},
    )

    assert resolve_execution_source(im_message) is SuperMagicExecutionSource.THIRD_PARTY_IM
    assert resolve_execution_source(cron_message) is SuperMagicExecutionSource.CRON


def test_remove_execution_source_from_dynamic_config_for_history_merge():
    cleaned = remove_execution_source_from_dynamic_config(
        {
            "message_version": "v2",
            EXECUTION_SOURCE_DYNAMIC_CONFIG_KEY: "human_chat",
        }
    )

    assert cleaned == {"message_version": "v2"}


def test_ask_user_policy_horizon_message_is_model_facing_english():
    message = build_ask_user_policy_horizon_message(SuperMagicExecutionSource.CRON)

    assert "The current execution source is cron" in message
    assert "Do not call ask_user" in message
    assert "interactive human chat" in message
