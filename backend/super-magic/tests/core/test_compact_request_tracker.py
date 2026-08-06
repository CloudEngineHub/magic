import app.service  # noqa: F401  # Ensure service package finishes initialization before importing app.magic modules.

from app.magic.compact_request_tracker import (
    CompactRequestState,
    CompactRequestTracker,
)


def test_compact_request_tracker_starts_on_compact_model():
    tracker = CompactRequestTracker()

    tracker.start(reason="hard_threshold")

    assert tracker.state == CompactRequestState.COMPACT_MODEL
    assert tracker.has_pending_request
    assert tracker.should_keep_compact_model
    assert tracker.reason == "hard_threshold"
    assert tracker.generation


def test_compact_request_tracker_falls_back_to_main_model_without_finishing_request():
    tracker = CompactRequestTracker()
    tracker.start(reason="hard_threshold")
    generation = tracker.generation

    tracker.fallback_to_main_model(reason="compact_model_failed")

    assert tracker.state == CompactRequestState.MAIN_MODEL_FALLBACK
    assert tracker.has_pending_request
    assert not tracker.should_keep_compact_model
    assert tracker.reason == "compact_model_failed"
    assert tracker.generation == generation


def test_compact_request_tracker_finish_is_idempotent():
    tracker = CompactRequestTracker()
    tracker.start(reason="hard_threshold")

    tracker.finish()
    tracker.finish()

    assert tracker.state == CompactRequestState.NO_REQUEST
    assert not tracker.has_pending_request
    assert not tracker.should_keep_compact_model
    assert tracker.reason == ""
    assert tracker.generation == ""


def test_compact_request_tracker_does_not_restart_pending_request():
    tracker = CompactRequestTracker()
    tracker.start(reason="hard_threshold")
    generation = tracker.generation

    tracker.start(reason="second_trigger")

    assert tracker.state == CompactRequestState.COMPACT_MODEL
    assert tracker.reason == "hard_threshold"
    assert tracker.generation == generation


def test_compact_request_tracker_ignores_fallback_without_pending_request():
    tracker = CompactRequestTracker()

    tracker.fallback_to_main_model(reason="compact_model_failed")

    assert tracker.state == CompactRequestState.NO_REQUEST
    assert not tracker.has_pending_request
    assert not tracker.should_keep_compact_model
