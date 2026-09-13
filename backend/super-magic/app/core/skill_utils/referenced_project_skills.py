"""Read companion skills from a bound, mounted referenced project."""

from __future__ import annotations

import os
from pathlib import Path
from typing import List, Optional

from agentlang.logger import get_logger
from agentlang.skills import SkillManager
from agentlang.skills.models import SkillMetadata

logger = get_logger(__name__)

DEFAULT_REFERENCED_PROJECT_MOUNT_BASE_PATH = "/mnt/agfs/magicfs/referenced-projects"
_SKILL_MD_FILENAME = "SKILL.md"
_MAX_NEST_DEPTH = 3
_SKILLS_RELATIVE_CANDIDATES = (
    Path(".magic") / "skills",
    Path(".workspace") / ".magic" / "skills",
)

REFERENCED_PROJECT_SKILL_TIP = (
    "To load a companion skill from this referenced project, call "
    "`read_skills(skill_names=[...], project_id=...)` using the `project_id` "
    "printed in the mention. Do not invent project_id, and do not load a "
    "same-named workspace or system skill instead."
)


def normalize_referenced_project_id(project_id: Optional[str]) -> str:
    """Return a single-segment project id, or empty if the value is unsafe."""
    value = str(project_id or "").strip()
    if not value or value in {".", ".."} or "/" in value or "\\" in value or "\0" in value:
        return ""
    return value


def get_referenced_project_mount_base() -> Path:
    raw = (
        os.getenv(
            "AGENT_REFERENCED_PROJECT_MOUNT_BASE_PATH",
            DEFAULT_REFERENCED_PROJECT_MOUNT_BASE_PATH,
        ).strip()
        or DEFAULT_REFERENCED_PROJECT_MOUNT_BASE_PATH
    )
    return Path(os.path.normpath(raw))


def get_referenced_project_mount_root(project_id: str) -> Optional[Path]:
    normalized = normalize_referenced_project_id(project_id)
    if not normalized:
        return None

    base = get_referenced_project_mount_base()
    if not base.is_absolute():
        return None

    root = Path(os.path.normpath(str(base / normalized)))
    try:
        root.relative_to(base)
    except ValueError:
        return None
    return root


def is_referenced_project_bound(project_id: str) -> bool:
    """True when the id is already mounted or bound via @micro_app scope."""
    normalized = normalize_referenced_project_id(project_id)
    if not normalized:
        return False

    mount_root = get_referenced_project_mount_root(normalized)
    if mount_root is not None and mount_root.is_dir():
        return True

    from app.service.mention.utils.micro_app_prompt import get_micro_app_project_scopes

    for entry in get_micro_app_project_scopes().values():
        if str(entry.get("project_id") or "").strip() == normalized:
            return True
    return False


def get_referenced_project_skills_dir(project_id: str) -> Optional[Path]:
    mount_root = get_referenced_project_mount_root(project_id)
    if mount_root is None:
        return None
    for relative in _SKILLS_RELATIVE_CANDIDATES:
        candidate = mount_root / relative
        if candidate.is_dir():
            return candidate
    return None


def _find_skill_md(root: Path, max_depth: int = _MAX_NEST_DEPTH) -> Optional[Path]:
    queue: list[tuple[Path, int]] = [(root, 0)]
    while queue:
        current, depth = queue.pop(0)
        if depth > max_depth:
            continue
        candidate = current / _SKILL_MD_FILENAME
        if candidate.is_file():
            return candidate
        if depth < max_depth:
            try:
                for child in current.iterdir():
                    if child.is_dir() and not child.name.startswith("."):
                        queue.append((child, depth + 1))
            except OSError:
                pass
    return None


def list_referenced_project_skill_names(project_id: str) -> List[str]:
    skills_dir = get_referenced_project_skills_dir(project_id)
    if skills_dir is None:
        return []

    names: List[str] = []
    try:
        for entry in skills_dir.iterdir():
            if not entry.is_dir() or entry.name.startswith("."):
                continue
            if (entry / _SKILL_MD_FILENAME).is_file() or _find_skill_md(entry) is not None:
                names.append(entry.name)
    except OSError as exc:
        logger.warning(f"Failed to list referenced-project skills ({skills_dir}): {exc}")
        return []
    return sorted(names)


def format_referenced_project_skill_lines(project_id: str) -> List[str]:
    normalized = normalize_referenced_project_id(project_id)
    if not normalized:
        return []
    names = list_referenced_project_skill_names(normalized)
    skill_text = ", ".join(names) if names else "none"
    return [
        f"   - project_id: {normalized}",
        f"   - skills: {skill_text}",
    ]


async def find_referenced_project_skill(
    skill_name: str,
    project_id: str,
) -> Optional[SkillMetadata]:
    skills_dir = get_referenced_project_skills_dir(project_id)
    if skills_dir is None:
        return None
    manager = SkillManager(skills_dirs=[skills_dir])
    return await manager.get_skill(skill_name)
