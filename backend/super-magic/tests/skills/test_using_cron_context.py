import json
import sys
from pathlib import Path

from app.path_manager import PathManager


SCRIPTS_DIR = (
    Path(__file__).resolve().parents[2]
    / "agents"
    / "skills"
    / "using-cron"
    / "scripts"
)
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import _context  # noqa: E402


def _write_session(path: Path, model_id: str) -> None:
    path.write_text(
        json.dumps({"current": {"model_id": model_id}}, ensure_ascii=False),
        encoding="utf-8",
    )


def test_get_model_id_uses_topic_pattern_session(monkeypatch, tmp_path):
    monkeypatch.setattr(
        PathManager,
        "get_chat_history_dir",
        classmethod(lambda cls: tmp_path),
    )
    _write_session(tmp_path / "slider<main>.session.json", "model-slider")

    assert _context._get_model_id(topic_pattern="slider") == "model-slider"


def test_get_model_id_falls_back_to_magic_session(monkeypatch, tmp_path):
    monkeypatch.setattr(
        PathManager,
        "get_chat_history_dir",
        classmethod(lambda cls: tmp_path),
    )
    _write_session(tmp_path / "magic<main>.session.json", "model-magic")

    assert _context._get_model_id(topic_pattern="slider") == "model-magic"


def test_get_model_id_uses_agent_code_session_for_custom_agent(monkeypatch, tmp_path):
    monkeypatch.setattr(
        PathManager,
        "get_chat_history_dir",
        classmethod(lambda cls: tmp_path),
    )
    _write_session(tmp_path / "SMA-custom-agent<main>.session.json", "model-custom")
    _write_session(tmp_path / "custom_agent<main>.session.json", "model-mode")

    assert (
        _context._get_model_id(
            topic_pattern="custom_agent",
            agent_code="SMA-custom-agent",
        )
        == "model-custom"
    )
