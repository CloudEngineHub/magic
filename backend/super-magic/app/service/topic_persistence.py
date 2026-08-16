"""Topic-local persistence detection and legacy directory migration helpers."""

from __future__ import annotations

import os
import json
import shutil
import tempfile
import zipfile
from pathlib import Path
from pathlib import PurePosixPath
from typing import Dict, Optional

from agentlang.logger import get_logger

logger = get_logger(__name__)

TOPIC_DIR_NAME = ".topic"
CHAT_HISTORY_DIR_NAME = "chat_history"
CHECKPOINTS_DIR_NAME = "checkpoints"
MIGRATION_STATE_FILE_NAME = ".migration_state.json"
PERSISTENCE_STATE_FILE_NAME = ".persistence_state.json"
STATE_SCHEMA_VERSION = 1


def should_upload_component(*, persistence_healthy: bool, component_persisted: bool) -> bool:
    """Return whether the zip fallback must run for one topic component."""
    return not (persistence_healthy and component_persisted)


def safe_extract_archive(
    archive_path: str,
    target_dir: Path,
    *,
    skip_top_level: Optional[str] = None,
    strip_top_level: Optional[str] = None,
) -> int:
    """Extract locally, filter unsafe/ignored members, then copy once to the target."""
    target_dir = Path(target_dir)
    with tempfile.TemporaryDirectory(prefix=".topic-extract-") as temp_dir:
        temp_root = Path(temp_dir)
        with zipfile.ZipFile(archive_path, "r") as zip_ref:
            members = []
            for member in zip_ref.infolist():
                normalized_name = member.filename.replace("\\", "/")
                path = PurePosixPath(normalized_name)
                if path.is_absolute() or ".." in path.parts:
                    raise ValueError(f"zip contains unsafe path: {member.filename}")
                effective_parts = path.parts
                if strip_top_level and effective_parts and effective_parts[0] == strip_top_level:
                    effective_parts = effective_parts[1:]
                if skip_top_level and skip_top_level in effective_parts:
                    continue
                members.append(member)
            zip_ref.extractall(temp_root, members=members)

        source_root = temp_root
        if strip_top_level:
            wrapped_root = temp_root / strip_top_level
            if wrapped_root.is_dir():
                source_root = wrapped_root

        target_dir.mkdir(parents=True, exist_ok=True)
        for source in source_root.iterdir():
            destination = target_dir / source.name
            if source.is_dir() and not source.is_symlink():
                shutil.copytree(source, destination, dirs_exist_ok=True)
            else:
                shutil.copy2(source, destination)
        return len(members)


class TopicPersistenceManager:
    """Persistence state and one-time legacy migration for the sandbox topic volume.

    The infrastructure mounts ``.topic`` as a topic-scoped persistent volume.
    Application code only verifies that the injected topic directories are
    available. Restore readiness is recorded independently per component.
    """

    def __init__(self, project_root: Path):
        self.project_root = Path(project_root)
        self.topic_dir = self.project_root / TOPIC_DIR_NAME
        self.chat_history_dir = self.topic_dir / CHAT_HISTORY_DIR_NAME
        self.checkpoints_dir = self.topic_dir / CHECKPOINTS_DIR_NAME
        self.migration_state_path = self.topic_dir / MIGRATION_STATE_FILE_NAME
        self.persistence_state_path = self.topic_dir / PERSISTENCE_STATE_FILE_NAME

    def ensure_directories(self) -> None:
        self.chat_history_dir.mkdir(parents=True, exist_ok=True)
        self.checkpoints_dir.mkdir(parents=True, exist_ok=True)

    def is_healthy(self, topic_id: Optional[str]) -> bool:
        """Return true when the sandbox-provided topic directories are available."""
        if not topic_id:
            return False
        self.ensure_directories()
        try:
            return self.topic_dir.is_dir() and self.chat_history_dir.is_dir() and self.checkpoints_dir.is_dir()
        except OSError as error:
            logger.warning("topic 持久卷健康检查失败: %s", error)
            return False

    def _load_state(self, path: Path) -> Dict[str, object]:
        try:
            if path.exists():
                with path.open("r", encoding="utf-8") as state_file:
                    state = json.load(state_file)
                return state if isinstance(state, dict) else {}
        except (OSError, ValueError) as error:
            logger.warning("读取 topic 状态失败 %s: %s", path, error)
        return {}

    def _save_state(self, path: Path, state: Dict[str, object]) -> None:
        self.topic_dir.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", suffix=".tmp", dir=self.topic_dir, delete=False
        ) as temp_file:
            json.dump(state, temp_file, ensure_ascii=False, indent=2)
            temp_path = Path(temp_file.name)
        os.replace(temp_path, path)

    def is_component_ready(self, component: str) -> bool:
        state = self._load_state(self.persistence_state_path)
        ready = state.get("ready", {})
        empty = state.get("empty", {})
        if not isinstance(ready, dict) or ready.get(component) is not True:
            return False
        if isinstance(empty, dict) and empty.get(component) is True:
            return True
        return self.component_has_data(component)

    def mark_component_ready(self, component: str, ready: bool = True) -> None:
        state = self._load_state(self.persistence_state_path)
        state["schema_version"] = STATE_SCHEMA_VERSION
        current_ready = state.get("ready")
        if not isinstance(current_ready, dict):
            current_ready = {}
        current_ready[component] = bool(ready)
        state["ready"] = current_ready
        empty = state.get("empty")
        if not isinstance(empty, dict):
            empty = {}
        empty[component] = bool(ready and not self.component_has_data(component))
        state["empty"] = empty
        self._save_state(self.persistence_state_path, state)

    def migrate_legacy_directories(self) -> Dict[str, bool]:
        """Migrate legacy directories once, with retryable per-component state."""
        self.ensure_directories()
        migrations = {
            "chat_history": (self.project_root / ".chat_history", self.chat_history_dir),
            "checkpoints": (self.project_root / ".checkpoints", self.checkpoints_dir),
        }
        migration_state_exists = self.migration_state_path.exists()
        migration_state = self._load_state(self.migration_state_path)
        completed = migration_state.get("completed")
        if not isinstance(completed, dict):
            completed = {}
        result: Dict[str, bool] = {}
        for name, (legacy_dir, target_dir) in migrations.items():
            if completed.get(name) is True:
                result[name] = False
                continue
            if not legacy_dir.is_dir():
                completed[name] = True
                result[name] = False
                continue
            if not migration_state_exists and any(target_dir.iterdir()):
                completed[name] = True
                result[name] = False
                self.mark_component_ready(name, True)
                continue
            try:
                entries = list(legacy_dir.iterdir())
                with tempfile.TemporaryDirectory(prefix=f".topic-migrate-{name}-") as temp_dir:
                    staged_dir = Path(temp_dir) / name
                    staged_dir.mkdir()
                    for entry in entries:
                        if name == "chat_history" and entry.name == "llm_request":
                            continue
                        destination = staged_dir / entry.name
                        if entry.is_dir() and not entry.is_symlink():
                            shutil.copytree(entry, destination)
                        else:
                            shutil.copy2(entry, destination)

                    if any(target_dir.iterdir()):
                        backup_dir = target_dir.with_name(f"{target_dir.name}.migration-partial")
                        if backup_dir.exists():
                            shutil.rmtree(backup_dir)
                        target_dir.rename(backup_dir)
                    target_dir.mkdir(parents=True, exist_ok=True)
                    for entry in staged_dir.iterdir():
                        destination = target_dir / entry.name
                        if entry.is_dir() and not entry.is_symlink():
                            shutil.copytree(entry, destination)
                        else:
                            shutil.copy2(entry, destination)
                result[name] = True
                completed[name] = True
                self.mark_component_ready(name, True)
            except OSError as error:
                logger.error("迁移旧 %s 目录失败: %s", name, error)
                result[name] = False
                completed[name] = False
        migration_state["schema_version"] = STATE_SCHEMA_VERSION
        migration_state["completed"] = completed
        if all(completed.get(name) is True for name in migrations):
            try:
                self.migration_state_path.unlink(missing_ok=True)
            except OSError as error:
                logger.warning("删除迁移状态文件失败: %s", error)
        else:
            self._save_state(self.migration_state_path, migration_state)
        return result

    def component_has_data(self, component: str) -> bool:
        directory = self.chat_history_dir if component == "chat_history" else self.checkpoints_dir
        try:
            entries = directory.iterdir()
            if component == "chat_history":
                return any(entry.name != "llm_request" for entry in entries)
            return any(entries)
        except OSError:
            return False
