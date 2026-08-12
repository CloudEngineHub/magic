import time
from pathlib import Path
from unittest.mock import patch

import pytest

from agentlang.llms.utils.debug_logger import (
    LLMDebugInfo,
    _get_llm_request_log_max_files,
    _prune_llm_request_logs,
    _sanitize_request_params,
    save_llm_debug_log,
)


def test_llm_debug_log_sanitizes_sensitive_request_params():
    sanitized = _sanitize_request_params({
        "model": "mock-model",
        "extra_headers": {
            "Magic-Authorization": "magic-secret",
            "User-Authorization": "user-secret",
            "Magic-Task-Id": "task-id",
        },
        "extra_body": {
            "api_key": "body-secret",
        },
    })

    assert sanitized["extra_headers"]["Magic-Authorization"] == "<redacted>"
    assert sanitized["extra_headers"]["User-Authorization"] == "<redacted>"
    assert sanitized["extra_headers"]["Magic-Task-Id"] == "task-id"
    assert sanitized["extra_body"]["api_key"] == "<redacted>"


@pytest.mark.parametrize(
    ("env_value", "expected"),
    [
        (None, 10),
        ("0", 0),
        ("10", 10),
        ("-3", 0),
        ("invalid", 10),
    ],
)
def test_get_llm_request_log_max_files(env_value, expected, monkeypatch):
    if env_value is None:
        monkeypatch.delenv("LLM_REQUEST_LOG_MAX_FILES", raising=False)
    else:
        monkeypatch.setenv("LLM_REQUEST_LOG_MAX_FILES", env_value)
    assert _get_llm_request_log_max_files() == expected


@pytest.mark.asyncio
async def test_prune_llm_request_logs_keeps_latest_files(tmp_path: Path):
    log_dir = tmp_path / "llm_request"
    log_dir.mkdir()

    paths = []
    for index in range(3):
        path = log_dir / f"model_{index}.log"
        path.write_text(f"log-{index}", encoding="utf-8")
        paths.append(path)
        time.sleep(0.01)

    await _prune_llm_request_logs(log_dir, 2)

    remaining = sorted(path.name for path in log_dir.glob("*.log"))
    assert remaining == ["model_1.log", "model_2.log"]


@pytest.mark.asyncio
async def test_prune_llm_request_logs_noop_when_unlimited(tmp_path: Path):
    log_dir = tmp_path / "llm_request"
    log_dir.mkdir()

    for index in range(3):
        (log_dir / f"model_{index}.log").write_text(f"log-{index}", encoding="utf-8")

    await _prune_llm_request_logs(log_dir, 0)

    assert len(list(log_dir.glob("*.log"))) == 3


@pytest.mark.asyncio
async def test_save_llm_debug_log_prunes_after_write(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("LLM_REQUEST_LOG_MAX_FILES", "2")

    chat_history_dir = tmp_path / ".chat_history"
    chat_history_dir.mkdir()
    log_dir = chat_history_dir / "llm_request"
    log_dir.mkdir()

    for index in range(2):
        (log_dir / f"old_{index}.log").write_text(f"old-{index}", encoding="utf-8")
        time.sleep(0.01)

    debug_info = LLMDebugInfo(
        model_id="mock-model",
        model_name="mock-model",
        provider="mock-provider",
        api_base_url="https://example.com",
        api_key="secret",
    )

    with patch("agentlang.path_manager.PathManager.get_chat_history_dir", return_value=chat_history_dir):
        await save_llm_debug_log(
            debug_info=debug_info,
            request_params={"model": "mock-model"},
            exception=RuntimeError("boom"),
            start_timestamp="2026-08-12T15:00:00",
            end_timestamp="2026-08-12T15:00:01",
        )

    remaining = sorted(log_dir.glob("*.log"), key=lambda path: path.stat().st_mtime)
    assert len(remaining) == 2
    assert all(path.name.startswith("mock-model_") or path.name.startswith("old_") for path in remaining)
    assert remaining[0].name.startswith("old_1.log")
    assert remaining[1].name.startswith("mock-model_")


@pytest.mark.asyncio
async def test_save_llm_debug_log_prunes_backlog_without_writing_success_log(
    tmp_path: Path,
    monkeypatch,
):
    monkeypatch.setenv("LLM_REQUEST_LOG_MAX_FILES", "2")
    monkeypatch.setenv("ENABLE_LLM_SUCCESS_REQUEST_LOG", "false")

    chat_history_dir = tmp_path / ".chat_history"
    chat_history_dir.mkdir()
    log_dir = chat_history_dir / "llm_request"
    log_dir.mkdir()

    for index in range(5):
        (log_dir / f"old_{index}.log").write_text(f"old-{index}", encoding="utf-8")
        time.sleep(0.01)

    debug_info = LLMDebugInfo(
        model_id="mock-model",
        model_name="mock-model",
        provider="mock-provider",
        api_base_url="https://example.com",
        api_key="secret",
    )

    with patch("agentlang.path_manager.PathManager.get_chat_history_dir", return_value=chat_history_dir):
        await save_llm_debug_log(
            debug_info=debug_info,
            request_params={"model": "mock-model"},
            response=object(),  # 模拟成功响应，不触发写盘
            start_timestamp="2026-08-12T15:00:00",
            end_timestamp="2026-08-12T15:00:01",
        )

    remaining = sorted(path.name for path in log_dir.glob("*.log"))
    assert remaining == ["old_3.log", "old_4.log"]
