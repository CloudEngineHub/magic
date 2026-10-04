"""Contracts for product requests, message cursors, and task receipts."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.infrastructure.sdk.magic_service.api.file_api import FileApi
from app.infrastructure.sdk.magic_service.api.message_api import MessageApi
from app.infrastructure.sdk.magic_service.api.project_api import ProjectApi
from app.infrastructure.sdk.magic_service.api.workspace_api import WorkspaceApi
from app.infrastructure.sdk.magic_service.kernel.magic_service_parameter import MagicServiceAuthConfig
from app.tools.super_magic.context import ProductContextError, current_product_context
from app.tools.super_magic.files import _batch_present, _batch_result
from app.tools.super_magic.message_formatter import format_topic_messages
from app.tools.super_magic.models import resource_id
from app.tools.super_magic.tasks import _submit


@pytest.fixture
def auth() -> MagicServiceAuthConfig:
    return MagicServiceAuthConfig(user_id="123", organization_code="org", user_authorization="secret")


def test_product_context_requires_current_chat_identity(monkeypatch):
    agent = SimpleNamespace(
        get_user_context_auth=lambda: None,
        get_user_context_host=lambda: "https://service.example",
        is_user_context_config_loaded=lambda: True,
    )
    context = SimpleNamespace(get_extension_typed=lambda key, typ: agent)
    with pytest.raises(ProductContextError):
        current_product_context(context)


def test_product_context_binds_current_auth_and_host(monkeypatch, auth):
    agent = SimpleNamespace(
        get_user_context_auth=lambda: auth,
        get_user_context_host=lambda: "https://service.example",
        is_user_context_config_loaded=lambda: True,
    )
    context = SimpleNamespace(get_extension_typed=lambda key, typ: agent)
    seen = []
    monkeypatch.setattr("app.tools.super_magic.context.create_magic_service_sdk", lambda **kwargs: seen.append(kwargs) or object())
    resolved = current_product_context(context)
    assert resolved.auth is auth
    assert seen == [{"base_url": "https://service.example"}]


@pytest.mark.asyncio
async def test_message_api_uses_v2_post_and_exact_cursor(monkeypatch, auth):
    captured = []

    async def request(self, parameter, method, path):
        captured.append((method, path, parameter.to_options(method)))
        return {"list": [], "has_more": False, "next_cursor": None}

    monkeypatch.setattr(MessageApi, "request_by_parameter_async", request)
    api = object.__new__(MessageApi)
    await api.list_topic_async(auth, "987654321012345678", limit=20)
    await api.list_topic_async(auth, "987654321012345678", after_id="123456789012345678", limit=10)

    assert captured[0][0:2] == ("POST", "/api/v2/super-agent/topics/987654321012345678/messages")
    assert captured[0][2]["json"] == {"limit": 20}
    assert captured[1][2]["json"] == {"limit": 10, "after_id": "123456789012345678"}
    assert captured[1][2]["headers"]["user-authorization"] == "secret"
    assert "token" not in captured[1][2]["headers"]


@pytest.mark.asyncio
async def test_workspace_discovery_disables_auto_creation(monkeypatch, auth):
    captured = {}

    async def request(self, parameter, method, path):
        captured.update(method=method, path=path, options=parameter.to_options(method))
        return {"list": []}

    monkeypatch.setattr(WorkspaceApi, "request_by_parameter_async", request)
    await object.__new__(WorkspaceApi).list_async(auth)
    assert captured["options"]["params"]["auto_create"] == "false"


@pytest.mark.asyncio
async def test_participated_projects_use_distinct_endpoint(monkeypatch, auth):
    captured = {}

    async def request(self, parameter, method, path):
        captured.update(method=method, path=path, options=parameter.to_options(method))
        return {"list": []}

    monkeypatch.setattr(ProjectApi, "request_by_parameter_async", request)
    await object.__new__(ProjectApi).list_async(auth, scope="participated")
    assert captured["method"] == "POST"
    assert captured["path"].endswith("/projects/participated")
    assert captured["options"]["json"]["show_hidden"] == 0


def test_message_cursor_survives_filtered_page():
    raw = {
        "list": [{"id": 123, "role": "assistant", "content_type": "reasoning", "content": "private"}],
        "has_more": True,
        "next_cursor": "123",
    }
    result = format_topic_messages("98", raw)
    assert result.ok
    assert result.data["messages"] == []
    assert result.data["next_cursor"] == "123"
    assert "private" not in result.content


def test_message_page_preserves_source_and_reports_truncation():
    raw = {
        "list": [{"id": 123, "message_id": "msg-1", "role": "user", "content": "x" * 7000, "send_timestamp": 1_700_000_000_000}],
        "has_more": False,
        "next_cursor": None,
    }
    result = format_topic_messages("98", raw)
    assert result.data["messages"][0]["record_id"] == "123"
    assert result.data["messages"][0]["message_id"] == "msg-1"
    assert result.data["messages"][0]["truncated"] is True
    assert "UTC" in result.content


@pytest.mark.parametrize("invalid", ["0", "01", "-1", "1.0", "9223372036854775808", "abc"])
def test_product_ids_reject_ambiguous_or_out_of_range_values(invalid):
    with pytest.raises(ValueError):
        resource_id(invalid)


@pytest.mark.asyncio
async def test_project_file_query_uses_bounded_authenticated_route(monkeypatch, auth):
    captured = {}

    async def request(self, parameter, method, path):
        captured.update(method=method, path=path, options=parameter.to_options(method))
        return {"list": [], "next_parent_ids": [], "has_more": False}

    monkeypatch.setattr(FileApi, "request_by_parameter_async", request)
    await object.__new__(FileApi).list_project_async(auth, "123", {"page_size": 50, "next_parent_ids": []})
    assert captured["method"] == "POST"
    assert captured["path"] == "/api/v1/open-api/agent/projects/123/files/query"
    assert captured["options"]["json"] == {"page_size": 50, "next_parent_ids": []}
    assert captured["options"]["headers"]["user-authorization"] == "secret"


def test_synchronous_delete_and_async_batch_receipts_remain_distinct():
    deleted = _batch_result({"project_id": 10, "file_ids": [1, 2], "count": 2})
    assert deleted["status"] == "success"
    assert "File 1: success" in _batch_present(deleted).content

    accepted = _batch_result({"batch_key": "batch-1", "status": "processing", "files": {}})
    assert "Check batch status" in _batch_present(accepted).content
    assert "batch-1" in _batch_present(accepted).content


@pytest.mark.asyncio
async def test_busy_topic_returns_queue_id_without_invented_task(auth):
    calls = []

    async def get_topic(_auth, topic_id):
        return {"id": topic_id, "project_id": "10", "topic_mode": "general"}

    async def create_task(_auth, body):
        calls.append(body)
        return {"task_id": "", "queue_id": "765"}

    ctx = SimpleNamespace(auth=auth, sdk=SimpleNamespace(
        topic=SimpleNamespace(get_async=get_topic),
        task=SimpleNamespace(create_async=create_task),
    ))
    receipt = await _submit(ctx, "10", "20", "Continue")
    assert receipt == {"kind": "queue", "topic_id": "20", "queue_id": "765", "status": "queued"}
    assert calls == [{"project_id": "10", "topic_id": "20", "content": "Continue", "agent_mode": "general", "force_interrupt": False}]


@pytest.mark.asyncio
async def test_custom_agent_mode_is_preserved(auth):
    sent = []

    async def get_topic(_auth, topic_id):
        return {"project_id": "10", "topic_mode": "custom_agent", "agent_code": "SMA-987"}

    async def create_task(_auth, body):
        sent.append(body)
        return {"task_id": "123"}

    ctx = SimpleNamespace(auth=auth, sdk=SimpleNamespace(
        topic=SimpleNamespace(get_async=get_topic),
        task=SimpleNamespace(create_async=create_task),
    ))
    receipt = await _submit(ctx, "10", "20", "Continue")
    assert receipt["task_id"] == "123"
    assert sent[0]["agent_mode"] == "SMA-987"
