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
async def test_micro_app_mention_resolves_project_scope():
    handler = MicroAppHandler()
    with patch(
        "app.service.mention.handlers.micro_app_handler.resolve_and_persist_micro_app_project_scope",
        new=AsyncMock(return_value="project-1"),
    ):
        tip = await handler.get_tip({"type": "micro_app", "app_id": "app-1"})
    assert "app-1" in tip
    assert "use-magicbase" in tip
