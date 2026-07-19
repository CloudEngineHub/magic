"""本地磁盘 skill 包发现：遍历目录解析 SKILL.md 元数据。

与 skillhub（从互联网检索/安装 skill 的 CLI 能力）无关，仅做 workspace / agents 等路径下的目录扫描。
"""
from pathlib import Path
from typing import List, Optional

from agentlang.logger import get_logger
from agentlang.skills.models import SkillMetadata
from app.core.skill_utils.constants import get_skillhub_install_dir
from app.core.skill_utils.skill_sources import get_personal_skills_dir
from app.utils.async_file_utils import async_exists, async_is_file, async_read_text, async_scandir

logger = get_logger(__name__)

_SKILL_MD_FILENAME = "SKILL.md"
_MAX_NEST_DEPTH = 3


async def _find_skill_md(root: Path, max_depth: int = _MAX_NEST_DEPTH) -> Optional[Path]:
    """使用广度优先策略查找指定深度内的首个 SKILL.md。

    平台 Skill 包可能存在额外嵌套层级，例如
    ``himalaya/himalaya/SKILL.md``。
    """
    queue: list[tuple[Path, int]] = [(root, 0)]
    while queue:
        current, depth = queue.pop(0)
        if depth > max_depth:
            continue
        candidate = current / _SKILL_MD_FILENAME
        if await async_is_file(candidate):
            return candidate
        if depth < max_depth:
            try:
                for child in await async_scandir(current):
                    if child.is_dir() and not child.name.startswith("."):
                        queue.append((Path(child.path), depth + 1))
            except PermissionError:
                pass
    return None


async def discover_skills_in_directory(skills_root: Path) -> List[SkillMetadata]:
    """遍历给定根目录下子目录，收集含 SKILL.md 的 skill 元数据。

    先检查 ``{entry}/SKILL.md``（常规单层结构）；若不存在则向下递归查找
    （平台 skill 包可能有多层嵌套）。每次调用均实时读盘，无缓存。
    """
    if not await async_exists(skills_root):
        return []

    results: List[SkillMetadata] = []

    try:
        entries = await async_scandir(skills_root)
        for entry in entries:
            if not entry.is_dir() or entry.name.startswith("."):
                continue

            entry_path = Path(entry.path)
            skill_file = entry_path / _SKILL_MD_FILENAME

            if not await async_exists(skill_file):
                found = await _find_skill_md(entry_path)
                if found is None:
                    continue
                skill_file = found

            skill_dir = skill_file.parent

            name = entry.name
            description = ""
            try:
                content = await async_read_text(skill_file)
                if content.startswith("---"):
                    end_idx = content.find("\n---", 3)
                    if end_idx > 0:
                        for line in content[3:end_idx].splitlines():
                            if line.startswith("name:"):
                                name = line.split(":", 1)[1].strip().strip("\"'")
                            elif line.startswith("description:"):
                                description = line.split(":", 1)[1].strip().strip("\"'")
            except Exception:
                pass

            results.append(SkillMetadata(name=name, description=description, skill_dir=skill_dir))
            logger.info(f"发现 skill: {name} (目录 {skills_root})")

    except Exception as e:
        logger.warning(f"遍历 skills 目录失败 ({skills_root}): {e}")

    return results


async def discover_skills_in_workspace() -> List[SkillMetadata]:
    """遍历 workspace 下持久化 skills 目录（路径同 get_skillhub_install_dir，即 .workspace/.magic/skills）。"""
    return await discover_skills_in_directory(get_skillhub_install_dir())


async def discover_skills_in_personal() -> List[SkillMetadata]:
    """遍历个人 skills 目录（~/.magic/skills）。"""
    return await discover_skills_in_directory(get_personal_skills_dir())
