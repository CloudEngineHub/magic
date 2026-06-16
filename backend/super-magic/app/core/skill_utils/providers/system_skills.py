"""Load built-in system skills from agents/skills/ and agents/crews/*/skills/.

System skills are bundled with the project, require no installation, and have
the highest provider priority. Crew-specific skill directories are exposed
through the same system provider. Search matches name, description, and
directory name.
"""
from __future__ import annotations

import asyncio
from pathlib import Path

from agentlang.logger import get_logger
from agentlang.skills.loader import SkillLoader
from app.utils.async_file_utils import async_exists, async_iterdir
from app.core.skill_utils.providers.base import (
    FetchedSkill,
    SkillCandidate,
    SkillProvider,
    SkillProviderId,
)

logger = get_logger(__name__)

_loader = SkillLoader()


class SystemSkillsProvider(SkillProvider):
    """System skill provider for agents/skills/ and agents/crews/*/skills/."""

    id = SkillProviderId.SYSTEM

    def _get_skills_root(self) -> Path:
        from app.path_manager import PathManager
        return PathManager.get_agents_dir() / "skills"

    def _get_crew_skills_roots(self) -> list[Path]:
        """Return all crew skill directories under agents/crews/*/skills/."""
        from app.path_manager import PathManager
        crews_root = PathManager.get_crew_root_dir()
        if not crews_root.exists():
            return []
        try:
            return [
                entry / "skills"
                for entry in crews_root.iterdir()
                if entry.is_dir() and not entry.name.startswith(".")
            ]
        except Exception as e:
            logger.warning(f"[system_skills] failed to scan crews directory: {e}")
            return []

    async def _scan_dir(self, skills_dir: Path) -> list[dict]:
        """Scan one skills directory and return skill metadata."""
        if not await async_exists(skills_dir):
            return []

        try:
            all_entries = await async_iterdir(skills_dir)
            entries = [e for e in all_entries if e.is_dir() and not e.name.startswith(".")]
        except Exception as e:
            logger.warning(f"[system_skills] failed to scan {skills_dir}: {e}")
            return []

        results: list[dict] = []
        for entry in entries:
            skill_md = entry / "SKILL.md"
            if not await async_exists(skill_md):
                continue
            try:
                meta = await _loader.load_from_file(skill_md)
                results.append({
                    "dir_name": entry.name,
                    "local_path": entry,
                    "name": meta.name or entry.name,
                    "description": meta.description or "",
                })
            except Exception as e:
                logger.warning(f"[system_skills] failed to read {skill_md}: {e}")

        return results

    async def _load_all(self) -> list[dict]:
        """Scan agents/skills/ plus all crew skill directories."""
        results = await self._scan_dir(self._get_skills_root())

        crew_roots = await asyncio.to_thread(self._get_crew_skills_roots)
        for crew_root in crew_roots:
            crew_results = await self._scan_dir(crew_root)
            results.extend(crew_results)

        return results

    def _matches(self, skill: dict, keyword: str) -> bool:
        """Return all skills for an empty keyword; otherwise match searchable fields."""
        if not keyword:
            return True
        kw = keyword.lower()
        return any(
            kw in str(skill.get(f, "")).lower()
            for f in ("name", "description", "dir_name")
        )

    async def search(self, keyword: str, limit: int | None = 10) -> list[SkillCandidate]:
        all_skills = await self._load_all()
        matched = [s for s in all_skills if self._matches(s, keyword)]
        effective = matched if limit is None else matched[:limit]
        return [
            SkillCandidate(
                provider=self.id,
                id=s["dir_name"],
                name=s["name"],
                description=s["description"],
                version=None,
                extra={
                    "local_path": str(s["local_path"]),
                },
            )
            for s in effective
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
        if isinstance(ref, SkillCandidate) and ref.extra.get("local_path"):
            local_path = Path(ref.extra["local_path"])
            if await async_exists(local_path):
                return FetchedSkill(
                    local_path=local_path,
                    version="system",
                    source_url=f"system://{skill_id}",
                )

        # Check agents/skills/ first.
        local_path = self._get_skills_root() / skill_id
        if await async_exists(local_path):
            return FetchedSkill(
                local_path=local_path,
                version="system",
                source_url=f"system://{skill_id}",
            )

        # Then check crew skill directories.
        crew_roots = await asyncio.to_thread(self._get_crew_skills_roots)
        for crew_root in crew_roots:
            candidate = crew_root / skill_id
            if await async_exists(candidate):
                return FetchedSkill(
                    local_path=candidate,
                    version="system",
                    source_url=f"system://{skill_id}",
                )

        raise FileNotFoundError(
            f"[system_skills] skill '{skill_id}' does not exist in agents/skills/ or any crew skills directory"
        )

    async def resolve_latest(self, ref: SkillCandidate | str) -> str | None:
        return None
