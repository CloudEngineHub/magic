"""
Read current session context, including topic_id and model_id.

- topic_id: read from metadata.topic_id in .credentials/init_client_message.json
- model_id: read from current.model_id in .chat_history/{agent_code or topic_pattern}<main>.session.json,
            falling back to .chat_history/magic<main>.session.json
"""
import json
import sys
from pathlib import Path
from typing import Optional, Tuple

# agents/skills/_shared/ is under parents[2] for all skill scripts.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import _shared.bootstrap  # noqa: F401 — initialize runtime environment


def _get_topic_id() -> Optional[str]:
    """Read topic_id from init_client_message.json."""
    try:
        from app.utils.init_client_message_util import InitClientMessageUtil
        metadata = InitClientMessageUtil.get_metadata()
        return metadata.get("topic_id")
    except Exception:
        return None


def _get_project_id() -> Optional[str]:
    """Read project_id from init_client_message.json."""
    try:
        from app.utils.init_client_message_util import InitClientMessageUtil
        metadata = InitClientMessageUtil.get_metadata()
        return metadata.get("project_id")
    except Exception:
        return None


def get_project_id() -> Optional[str]:
    """Return the current session project_id for list-like scripts."""
    return _get_project_id()


def _read_model_id(session_file: Path) -> Optional[str]:
    """Read model_id from a local session file."""
    try:
        if not session_file.exists():
            return None
        with session_file.open("r", encoding="utf-8") as f:
            data = json.load(f)
        # Prefer current, then fall back to last.
        current = data.get("current") or {}
        model_id = current.get("model_id")
        if not model_id:
            last = data.get("last") or {}
            model_id = last.get("model_id")
        return model_id or None
    except Exception:
        return None


def _is_safe_session_name(value: str) -> bool:
    """Validate a session filename prefix and reject path traversal."""
    return "/" not in value and "\\" not in value and ".." not in value


def _append_session_candidate(candidates: list[Path], chat_history_dir: Path, name: Optional[str]) -> None:
    if not name:
        return
    normalized = name.strip()
    if not normalized or not _is_safe_session_name(normalized):
        return
    session_file = chat_history_dir / f"{normalized}<main>.session.json"
    if session_file not in candidates:
        candidates.append(session_file)


def _get_model_id(topic_pattern: Optional[str] = None, agent_code: Optional[str] = None) -> Optional[str]:
    """Read model_id from the session file for the current agent mode."""
    try:
        from app.path_manager import PathManager

        chat_history_dir = Path(PathManager.get_chat_history_dir())
        candidates: list[Path] = []
        _append_session_candidate(candidates, chat_history_dir, agent_code)
        _append_session_candidate(candidates, chat_history_dir, topic_pattern)
        candidates.append(chat_history_dir / "magic<main>.session.json")

        for session_file in candidates:
            model_id = _read_model_id(session_file)
            if model_id:
                return model_id
        return None
    except Exception:
        return None


def get_context(
    topic_pattern: Optional[str] = None,
    agent_code: Optional[str] = None,
) -> Tuple[Optional[str], Optional[str]]:
    """
    Return (topic_id, model_id).

    Either value may be None when source files are missing or fields are absent.
    """
    return _get_topic_id(), _get_model_id(topic_pattern=topic_pattern, agent_code=agent_code)
