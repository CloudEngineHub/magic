from unittest.mock import AsyncMock, patch

import pytest

from app.service.mention.utils.micro_app_prompt import (
    extract_micro_app_app_ids,
    sync_micro_app_project_scope_from_prompt,
)


def test_extract_micro_app_app_ids_from_rich_text():
    prompt = (
        '{"type":"doc","content":[{"type":"mention","attrs":{"type":"micro_app",'
        '"data":{"app_id":"app-1"}}},{"type":"mention","attrs":{"type":"micro_app",'
        '"data":{"app_id":"app-1"}}},{"type":"mention","attrs":{"type":"micro_app",'
        '"data":{"app_id":"app-2"}}}]}'
    )
    assert extract_micro_app_app_ids(prompt) == ["app-1", "app-2"]


def test_extract_micro_app_app_ids_ignores_plain_text_mentions_and_urls():
    assert extract_micro_app_app_ids("@Demo App https://example.test/micro_app://app-1") == []


@pytest.mark.asyncio
async def test_sync_micro_app_project_scope_skips_ambiguous_multiple_apps():
    prompt = (
        '{"type":"doc","content":[{"type":"mention","attrs":{"type":"micro_app",'
        '"data":{"app_id":"app-1"}}},{"type":"mention","attrs":{"type":"micro_app",'
        '"data":{"app_id":"app-2"}}}]}'
    )
    with patch(
        "app.service.mention.utils.micro_app_prompt.resolve_and_persist_micro_app_project_scope",
        new=AsyncMock(return_value="project-2"),
    ) as resolve_mock:
        assert await sync_micro_app_project_scope_from_prompt(prompt) is None
        resolve_mock.assert_not_awaited()
