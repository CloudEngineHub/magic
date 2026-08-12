from dataclasses import fields

import pytest

from app.core.horizon.migration import CURRENT_VERSION
from app.core.horizon.models import (
    FileContextRecord,
    HorizonState,
    ImageModelState,
    ManualContextWindowState,
    PendingNotification,
    VideoModelState,
)
from app.core.horizon.store import (
    HorizonStore,
    _assert_codec_covers_horizon_state,
)
from app.utils.async_file_utils import async_read_json, async_write_json


def _full_horizon_state(agent_id: str = "agent-1") -> HorizonState:
    return HorizonState(
        agent_id=agent_id,
        file_records={
            "/workspace/example.txt": FileContextRecord(
                path="/workspace/example.txt",
                file_hash="hash",
                file_mtime_ms=123.0,
                file_size_bytes=7,
                file_content="content",
                tool_name="read_file",
                truncated=False,
                metadata={"source": "test"},
                read_at="2026-07-24T00:00:00+00:00",
                read_ranges=[(1, 2)],
            )
        },
        pending_notifications=[
            PendingNotification(
                pushed_at="2026-07-24T00:00:00+00:00",
                source="test",
                content="notification",
            )
        ],
        loaded_skills=["skill-a"],
        image_model=ImageModelState(model_id="image-model", sizes=[{"value": "1:1"}]),
        video_model=VideoModelState(model_id="video-model", config={"duration": 5}),
        manual_context_windows={
            "text-model": ManualContextWindowState(user_manual_max_context_tokens=128_000)
        },
        llm_model_id="text-model",
        llm_model_name="Text Model",
        process_started_at_ns=123,
        user_preferred_language="zh-CN",
        workspace_files="workspace tree",
        workspace_entries=[{"path": "example.txt"}],
        memory="memory",
        client_context="client context",
        cli_status="cli status",
        context_usage_baseline_used=100,
        context_usage_baseline_total=200,
        context_usage_baseline_used_pct=50,
        initial_context_injected=True,
        last_injected_date="2026-07-24",
    )


@pytest.mark.asyncio
async def test_horizon_store_round_trip_keeps_existing_schema(tmp_path):
    store = HorizonStore(str(tmp_path), "test-agent", "agent-1")
    state = _full_horizon_state()

    await store.save(state)

    document = await async_read_json(store.path)
    assert document["version"] == CURRENT_VERSION
    assert set(document) - {"version"} == {
        state_field.name for state_field in fields(HorizonState)
    }
    assert await store.load() == state


@pytest.mark.asyncio
async def test_horizon_store_does_not_partially_load_corrupted_nested_data(tmp_path):
    store = HorizonStore(str(tmp_path), "test-agent", "agent-1")
    await async_write_json(
        store.path,
        {
            "version": CURRENT_VERSION,
            "agent_id": "agent-1",
            "pending_notifications": [{"pushed_at": "now", "source": "test"}],
        },
    )

    assert await store.load() is None
    with pytest.raises(KeyError):
        await HorizonStore.load_for_session("test-agent", "agent-1", tmp_path)


def test_horizon_codec_coverage_fails_when_a_field_is_missing():
    with pytest.raises(RuntimeError, match="missing=.*agent_id"):
        _assert_codec_covers_horizon_state("test", set())


@pytest.mark.asyncio
async def test_horizon_fork_write_retargets_agent_without_mutating_source(tmp_path):
    state = _full_horizon_state("parent")
    target_path = tmp_path / "child.horizon.json"

    await HorizonStore.write_fork_state(
        state,
        target_agent_id="child",
        horizon_path=target_path,
    )

    assert state.agent_id == "parent"
    assert (await async_read_json(target_path))["agent_id"] == "child"
