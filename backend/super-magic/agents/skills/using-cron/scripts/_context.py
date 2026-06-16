"""
Read current session context, including topic_id and model_id.

- topic_id: read from metadata.topic_id in .credentials/init_client_message.json
- model_id: read from current.model_id in the local .chat_history/magic<main>.session.json
"""
import json
import os
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


def _get_model_id() -> Optional[str]:
    """Read model_id from the local session file."""
    try:
        from app.path_manager import PathManager
        chat_history_dir = str(PathManager.get_chat_history_dir())
        session_file = os.path.join(chat_history_dir, "magic<main>.session.json")
        if not os.path.exists(session_file):
            return None
        with open(session_file, "r", encoding="utf-8") as f:
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


def get_context() -> Tuple[Optional[str], Optional[str]]:
    """
    Return (topic_id, model_id).

    Either value may be None when source files are missing or fields are absent.
    """
    return _get_topic_id(), _get_model_id()
