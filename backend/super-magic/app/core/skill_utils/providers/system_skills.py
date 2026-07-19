"""Load built-in system skills visible to the current Agent.

System skills are bundled with the project, require no installation, and have
the highest provider priority. The provider includes agents/skills/ and only
the current Agent's Crew skill directory, matching read_skills visibility.
"""
from __future__ import annotations

from collections.abc import Collection
from dataclasses import dataclass
from pathlib import Path

from agentlang.logger import get_logger
from agentlang.skills.loader import SkillLoader
from app.core.skill_utils.providers.base import (
    FetchedSkill,
    SkillCandidate,
    SkillProvider,
    SkillProviderId,
)
from app.utils.async_file_utils import async_exists, async_scandir

logger = get_logger(__name__)

_loader = SkillLoader()


@dataclass(frozen=True, slots=True)
class _SystemSkill:
    """一次 system/Crew Skill 扫描得到的稳定元数据。"""

    dir_name: str
    local_path: Path
    name: str
    description: str
    search_terms: tuple[str, ...] = ()


class SystemSkillsProvider(SkillProvider):
    """System skill provider for globally visible and current Crew skills."""

    id = SkillProviderId.SYSTEM

    def __init__(
        self,
        *,
        agent_name: str = "",
        excluded_skills: Collection[str] = (),
    ) -> None:
        self._agent_name = agent_name.strip()
        self._excluded_skills = frozenset(
            value.strip().casefold()
            for value in excluded_skills
            if value.strip()
        )

    def _get_skills_root(self) -> Path:
        from app.path_manager import PathManager
        return PathManager.get_agents_dir() / "skills"

    def _get_current_crew_skills_root(self) -> Path | None:
        """Return the current Agent's Crew skill directory, if available."""
        from app.path_manager import PathManager

        if not self._agent_name:
            return None
        try:
            return PathManager.get_crew_skills_dir(self._agent_name)
        except ValueError as e:
            logger.warning(f"[system_skills] invalid current agent name: {e}")
            return None

    def _get_local_skills_roots(self) -> list[Path]:
        """Return local Skill roots in the same priority order used by read_skills."""

        from app.core.skill_utils.skill_sources import (
            get_agents_workspace_skills_dir,
            get_home_skills_dir,
            get_personal_skills_dir,
            get_system_skills_dir,
            get_workspace_skills_dir,
        )

        roots: list[Path] = []
        crew_root = self._get_current_crew_skills_root()
        if crew_root is not None:
            roots.append(crew_root)
        roots.extend(
            [
                get_system_skills_dir(),
                get_workspace_skills_dir(),
                get_personal_skills_dir(),
                get_agents_workspace_skills_dir(),
                get_home_skills_dir(),
            ]
        )
        return roots

    async def _scan_dir(self, skills_dir: Path) -> list[_SystemSkill]:
        """Scan one skills directory and return skill metadata."""
        if not await async_exists(skills_dir):
            return []

        try:
            entries = sorted(
                (
                    entry
                    for entry in await async_scandir(skills_dir)
                    if entry.is_dir() and not entry.name.startswith(".")
                ),
                key=lambda entry: entry.name.casefold(),
            )
        except Exception as e:
            logger.warning(f"[system_skills] failed to scan {skills_dir}: {e}")
            raise

        results: list[_SystemSkill] = []
        for entry in entries:
            local_path = Path(entry.path)
            skill_md = local_path / "SKILL.md"
            if not await async_exists(skill_md):
                continue
            try:
                meta = await _loader.load_from_file(skill_md)
                raw_metadata = meta.raw_metadata
                search_terms = tuple(
                    str(raw_metadata.get(key) or "").strip()
                    for key in ("name-cn", "description-cn", "name_cn", "description_cn")
                    if str(raw_metadata.get(key) or "").strip()
                )
                results.append(
                    _SystemSkill(
                        dir_name=entry.name,
                        local_path=local_path,
                        name=meta.name or entry.name,
                        description=meta.description or "",
                        search_terms=search_terms,
                    )
                )
            except Exception as e:
                logger.warning(f"[system_skills] failed to read {skill_md}: {e}")

        return results

    async def _load_all(self) -> list[_SystemSkill]:
        """Scan all visible local roots and keep the first matching Skill by priority."""
        scanned: list[_SystemSkill] = []
        for skills_root in self._get_local_skills_roots():
            scanned.extend(await self._scan_dir(skills_root))

        results: list[_SystemSkill] = []
        seen_ids: set[str] = set()
        seen_names: set[str] = set()
        for skill in scanned:
            normalized_id = skill.dir_name.strip().casefold()
            normalized_name = skill.name.strip().casefold()
            if normalized_id in seen_ids or normalized_name in seen_names:
                continue
            seen_ids.add(normalized_id)
            seen_names.add(normalized_name)
            results.append(skill)
        return results

    def _is_excluded(self, skill: _SystemSkill) -> bool:
        return bool(
            self._excluded_skills
            & {
                skill.dir_name.strip().casefold(),
                skill.name.strip().casefold(),
            }
        )

    def _matches(self, skill: _SystemSkill, keyword: str) -> bool:
        """Return all skills for an empty keyword; otherwise match searchable fields."""
        if not keyword:
            return True
        normalized_keyword = keyword.casefold()
        return any(
            normalized_keyword in value.casefold()
            for value in (skill.name, skill.description, skill.dir_name, *skill.search_terms)
        )

    async def search(self, keyword: str, limit: int | None = 10) -> list[SkillCandidate]:
        all_skills = await self._load_all()
        matched = [
            skill
            for skill in all_skills
            if not self._is_excluded(skill) and self._matches(skill, keyword)
        ]
        effective = matched if limit is None else matched[:limit]
        return [
            SkillCandidate(
                provider=self.id,
                id=skill.dir_name,
                name=skill.name,
                description=skill.description,
                version=None,
                extra={
                    "local_path": str(skill.local_path),
                },
            )
            for skill in effective
        ]

    async def fetch(
        self,
        ref: SkillCandidate | str,
        *,
        version: str | None = None,
    ) -> FetchedSkill:
        """Return the local path for a bundled system skill."""
        skill_id = self._get_id(ref)

        # Prefer the exact path carried by the search candidate.
        candidate_path = ref.extra.get("local_path") if isinstance(ref, SkillCandidate) else None
        if isinstance(candidate_path, str) and candidate_path:
            local_path = Path(candidate_path)
            if await async_exists(local_path):
                return FetchedSkill(
                    local_path=local_path,
                    version="system",
                    source_url=f"system://{skill_id}",
                )

        for skills_root in self._get_local_skills_roots():
            candidate = skills_root / skill_id
            if await async_exists(candidate):
                return FetchedSkill(
                    local_path=candidate,
                    version="system",
                    source_url=f"system://{skill_id}",
                )

        raise FileNotFoundError(
            f"[system_skills] skill '{skill_id}' is not visible to the current Agent"
        )

    async def resolve_latest(self, ref: SkillCandidate | str) -> str | None:
        return None
