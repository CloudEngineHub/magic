"""
获取当前会话上下文（topic_id 和 model_id）

- topic_id: 从 .credentials/init_client_message.json 的 metadata.topic_id 读取
- model_id:  从本地 .chat_history/{agent_code 或 topic_pattern}<main>.session.json
             的 current.model_id 读取，并兼容回退到 magic<main>.session.json
"""
import json
import sys
from pathlib import Path
from typing import Optional, Tuple

# agents/skills/_shared/ 对所有 skill 脚本均在 parents[2] 下
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import _shared.bootstrap  # noqa: F401 — 触发环境初始化


def _get_topic_id() -> Optional[str]:
    """从 init_client_message.json 读取 topic_id"""
    try:
        from app.utils.init_client_message_util import InitClientMessageUtil
        metadata = InitClientMessageUtil.get_metadata()
        return metadata.get("topic_id")
    except Exception:
        return None


def _get_project_id() -> Optional[str]:
    """从 init_client_message.json 读取 project_id"""
    try:
        from app.utils.init_client_message_util import InitClientMessageUtil
        metadata = InitClientMessageUtil.get_metadata()
        return metadata.get("project_id")
    except Exception:
        return None


def get_project_id() -> Optional[str]:
    """返回当前会话的 project_id，供 list 等脚本使用"""
    return _get_project_id()


def _read_model_id(session_file: Path) -> Optional[str]:
    """从本地 session 文件读取 model_id"""
    try:
        if not session_file.exists():
            return None
        with session_file.open("r", encoding="utf-8") as f:
            data = json.load(f)
        # 优先取 current，其次取 last
        current = data.get("current") or {}
        model_id = current.get("model_id")
        if not model_id:
            last = data.get("last") or {}
            model_id = last.get("model_id")
        return model_id or None
    except Exception:
        return None


def _is_safe_session_name(value: str) -> bool:
    """校验 session 文件名前缀，避免路径穿越。"""
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
    """从当前 agent mode 对应 session 文件读取 model_id"""
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
    返回 (topic_id, model_id)

    两者均可能为 None（文件不存在或字段缺失时）。
    """
    return _get_topic_id(), _get_model_id(topic_pattern=topic_pattern, agent_code=agent_code)
