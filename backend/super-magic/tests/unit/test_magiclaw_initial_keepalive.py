import asyncio
import sys
import types
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

# AgentContext imports storage.types, but the storage package initializer eagerly imports
# optional cloud SDKs. This test needs the real types module, not those driver side effects.
_storage_package_was_stubbed = "app.infrastructure.storage" not in sys.modules
if _storage_package_was_stubbed:
    storage_package = types.ModuleType("app.infrastructure.storage")
    storage_package.__path__ = [
        str(Path(__file__).resolve().parents[2] / "app" / "infrastructure" / "storage")
    ]
    sys.modules["app.infrastructure.storage"] = storage_package

# Import the focused listener module without executing agent_event.__init__, which eagerly
# imports unrelated listener/tool trees and their optional CLI dependencies.
_agent_event_package_was_stubbed = "app.service.agent_event" not in sys.modules
if _agent_event_package_was_stubbed:
    agent_event_package = types.ModuleType("app.service.agent_event")
    agent_event_package.__path__ = [
        str(Path(__file__).resolve().parents[2] / "app" / "service" / "agent_event")
    ]
    sys.modules["app.service.agent_event"] = agent_event_package

from app.service.agent_event.channel_startup_listener_service import (
    ChannelStartupListenerService,
)
from app.core.keepalive_registry import KeepaliveRegistry

if _agent_event_package_was_stubbed:
    sys.modules.pop("app.service.agent_event", None)
if _storage_package_was_stubbed:
    sys.modules.pop("app.infrastructure.storage", None)


def _event(*, success: bool, is_magiclaw: bool = False, with_context: bool = True):
    agent_context = None
    if with_context:
        agent_context = SimpleNamespace(is_magiclaw=MagicMock(return_value=is_magiclaw))
    return SimpleNamespace(
        data=SimpleNamespace(
            success=success,
            error=None if success else "initialization failed",
            agent_context=agent_context,
        )
    )


@pytest.fixture
def lifecycle_dependencies(monkeypatch):
    registry = MagicMock()
    auto_connect = AsyncMock()

    monkeypatch.setattr(
        "app.core.keepalive_registry.KeepaliveRegistry.get_instance",
        MagicMock(return_value=registry),
    )
    monkeypatch.setattr(
        "app.channel.startup.auto_connect_channels_for_current_sandbox",
        auto_connect,
    )
    return registry, auto_connect


@pytest.mark.asyncio
async def test_magiclaw_after_init_enables_and_starts_keepalive(
    lifecycle_dependencies,
    monkeypatch,
):
    registry, auto_connect = lifecycle_dependencies
    monkeypatch.setattr(
        "app.utils.sandbox_env.is_magiclaw_sandbox",
        AsyncMock(return_value=False),
    )

    await ChannelStartupListenerService._handle_after_init(
        _event(success=True, is_magiclaw=True)
    )
    await asyncio.sleep(0)

    registry.set_enabled.assert_called_once_with(True)
    registry.notify_activity.assert_called_once_with("magiclaw:init")
    auto_connect.assert_awaited_once_with()


@pytest.mark.asyncio
async def test_non_magiclaw_after_init_disables_keepalive(
    lifecycle_dependencies,
    monkeypatch,
):
    registry, auto_connect = lifecycle_dependencies
    monkeypatch.setattr(
        "app.utils.sandbox_env.is_magiclaw_sandbox",
        AsyncMock(return_value=True),
    )

    await ChannelStartupListenerService._handle_after_init(
        _event(success=True, is_magiclaw=False)
    )
    await asyncio.sleep(0)

    registry.set_enabled.assert_called_once_with(False)
    registry.notify_activity.assert_not_called()
    auto_connect.assert_not_awaited()


@pytest.mark.asyncio
async def test_magiclaw_keepalive_failure_does_not_block_auto_connect(
    lifecycle_dependencies,
):
    registry, auto_connect = lifecycle_dependencies
    registry.notify_activity.side_effect = RuntimeError("keepalive failed")

    await ChannelStartupListenerService._handle_after_init(
        _event(success=True, is_magiclaw=True)
    )
    await asyncio.sleep(0)

    registry.set_enabled.assert_called_once_with(True)
    registry.notify_activity.assert_called_once_with("magiclaw:init")
    auto_connect.assert_awaited_once_with()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "event",
    [
        _event(success=False, is_magiclaw=True),
        _event(success=True, with_context=False),
    ],
)
async def test_unsuccessful_after_init_does_not_change_lifecycle(
    event,
    lifecycle_dependencies,
    monkeypatch,
):
    registry, auto_connect = lifecycle_dependencies
    sandbox_check = AsyncMock(return_value=True)
    monkeypatch.setattr(
        "app.utils.sandbox_env.is_magiclaw_sandbox",
        sandbox_check,
    )

    await ChannelStartupListenerService._handle_after_init(event)
    await asyncio.sleep(0)

    registry.set_enabled.assert_not_called()
    registry.notify_activity.assert_not_called()
    auto_connect.assert_not_awaited()


def test_notify_connected_once_does_not_start_rolling_loop(monkeypatch):
    registry = KeepaliveRegistry()
    keepalive_once = MagicMock()
    ensure_loop = MagicMock()
    monkeypatch.setattr(registry, "keepalive_once", keepalive_once)
    monkeypatch.setattr(registry, "_ensure_loop_running", ensure_loop)

    registry.notify_connected_once("wechat")

    keepalive_once.assert_called_once_with("wechat.connected")
    ensure_loop.assert_not_called()


def test_notify_activity_records_latest_time_and_starts_loop(monkeypatch):
    registry = KeepaliveRegistry()
    keepalive_once = MagicMock()
    ensure_loop = MagicMock()
    monkeypatch.setattr(registry, "keepalive_once", keepalive_once)
    monkeypatch.setattr(registry, "_ensure_loop_running", ensure_loop)

    registry.notify_activity("wechat", occurred_at_ms=123456)

    assert registry._last_activity_at_ms_by_source["wechat"] == 123456
    keepalive_once.assert_called_once_with("wechat.activity")
    ensure_loop.assert_called_once_with()


def test_reenable_allows_activity_after_disable(monkeypatch):
    registry = KeepaliveRegistry()
    keepalive_once = MagicMock()
    ensure_loop = MagicMock()
    monkeypatch.setattr(registry, "keepalive_once", keepalive_once)
    monkeypatch.setattr(registry, "_ensure_loop_running", ensure_loop)

    registry.set_enabled(False)
    registry.set_enabled(True)
    registry.notify_activity("magiclaw:init", occurred_at_ms=123456)

    assert registry._last_activity_at_ms_by_source["magiclaw:init"] == 123456
    keepalive_once.assert_called_once_with("magiclaw:init.activity")
    ensure_loop.assert_called_once_with()
