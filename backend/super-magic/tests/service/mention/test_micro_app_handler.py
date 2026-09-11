from unittest.mock import AsyncMock, patch

import pytest

from app.service.mention.handlers.micro_app_handler import MicroAppHandler


@pytest.mark.asyncio
async def test_micro_app_mention_uses_app_id_only():
    handler = MicroAppHandler()

    assert await handler.handle({"type": "micro_app", "app_id": "app-1", "app_name": "Ignored"}, 1) == [
        "1. [Ignored](micro_app://app-1)"
    ]


@pytest.mark.asyncio
async def test_micro_app_mention_without_app_id_is_rejected():
    handler = MicroAppHandler()

    assert "app_id is missing" in await handler.get_tip({"type": "micro_app"})


@pytest.mark.asyncio
async def test_micro_app_mention_tip_requires_bound_scope():
    handler = MicroAppHandler()
    with (
        patch(
            "app.service.mention.handlers.micro_app_handler.has_bound_micro_app_project_scope",
            return_value=True,
        ),
        patch(
            "app.service.mention.handlers.micro_app_handler.get_micro_app_project_scopes",
            return_value={"app-1": {"project_id": "project-1", "app_name": "App One"}},
        ),
    ):
        tip = await handler.get_tip({"type": "micro_app", "app_id": "app-1"})
    assert "app-1" in tip
    assert "use-magicbase" in tip


@pytest.mark.asyncio
async def test_micro_app_mention_tip_lists_multiple_bound_scopes():
    handler = MicroAppHandler()
    with (
        patch(
            "app.service.mention.handlers.micro_app_handler.has_bound_micro_app_project_scope",
            return_value=True,
        ),
        patch(
            "app.service.mention.handlers.micro_app_handler.get_micro_app_project_scopes",
            return_value={
                "app-1": {"project_id": "project-1", "app_name": "App One"},
                "app-2": {"project_id": "project-2", "app_name": "App Two"},
            },
        ),
    ):
        tip = await handler.get_tip({"type": "micro_app", "app_id": "app-1"})
    assert "Pass app_id" in tip
    assert "micro_app://app-1" in tip
    assert "micro_app://app-2" in tip


@pytest.mark.asyncio
async def test_micro_app_mention_without_bound_scope_returns_empty_tip():
    handler = MicroAppHandler()
    with patch(
        "app.service.mention.handlers.micro_app_handler.has_bound_micro_app_project_scope",
        return_value=False,
    ):
        tip = await handler.get_tip(
            {
                "type": "micro_app",
                "app_id": "app-1",
                "project_id": "project-1",
            }
        )
    assert tip == ""


@pytest.mark.asyncio
async def test_micro_app_mention_tip_skips_unresolved_app_id():
    handler = MicroAppHandler()
    with (
        patch(
            "app.service.mention.handlers.micro_app_handler.has_bound_micro_app_project_scope",
            return_value=True,
        ),
        patch(
            "app.service.mention.handlers.micro_app_handler.get_micro_app_project_scopes",
            return_value={"app-1": {"project_id": "project-1", "app_name": "App One"}},
        ),
    ):
        tip = await handler.get_tip({"type": "micro_app", "app_id": "app-2"})
    assert tip == ""
