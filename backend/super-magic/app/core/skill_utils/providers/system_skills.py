"""SystemSkillsProvider：聚合本地已可直接读取的 skill

本地 skill 无需安装，对外统一以 system 来源呈现。
扫描目录与 GlobalSkillManager 保持一致，确保 find_skills 和 read_skills 的结果一致。
搜索时联合匹配 name / description / name-cn / description-cn / 目录名。
"""
from __future__ import annotations

from pathlib import Path

from agentlang.logger import get_logger
from agentlang.skills.loader import SkillLoader
from app.core.skill_utils.providers.base import (
    FetchedSkill,
    SkillCandidate,
    SkillProvider,
    SkillProviderId,
)
from app.utils.async_file_utils import async_exists, async_iterdir

logger = get_logger(__name__)

_loader = SkillLoader()


class SystemSkillsProvider(SkillProvider):
    """本地可用 skill 聚合来源。"""

    id = SkillProviderId.SYSTEM

    def _get_local_skills_roots(self) -> list[Path]:
        """返回 read_skills 当前可读取的全部本地 Skill 根目录。"""
        from app.core.skill_utils.manager import GlobalSkillManager

        return GlobalSkillManager.get_skills_dirs()

    async def _scan_dir(self, skills_dir: Path) -> list[dict]:
        """扫描单个 skills 目录，返回 skill 元数据列表"""
        if not await async_exists(skills_dir):
            return []

        try:
            all_entries = await async_iterdir(skills_dir)
            entries = [e for e in all_entries if e.is_dir() and not e.name.startswith(".")]
        except Exception as e:
            logger.warning(f"[system_skills] 遍历 {skills_dir} 失败: {e}")
            return []

        results: list[dict] = []
        for entry in entries:
            skill_md = entry / "SKILL.md"
            if not await async_exists(skill_md):
                continue
            try:
                meta = await _loader.load_from_file(skill_md)
                raw = meta.raw_metadata or {}
                results.append({
                    "dir_name": entry.name,
                    "local_path": entry,
                    "name": meta.name or entry.name,
                    "description": meta.description or raw.get("description-cn") or "",
                    "name_cn": raw.get("name-cn") or "",
                    "description_cn": raw.get("description-cn") or "",
                })
            except Exception as e:
                logger.warning(f"[system_skills] 读取 {skill_md} 失败: {e}")

        return results

    async def _load_all(self) -> list[dict]:
        """按读取优先级扫描全部本地目录，并对同名目录去重。"""
        results: list[dict] = []
        loaded_names: set[str] = set()

        for skills_root in self._get_local_skills_roots():
            root_results = await self._scan_dir(skills_root)
            for skill in root_results:
                normalized_name = skill["dir_name"].casefold()
                if normalized_name in loaded_names:
                    continue
                results.append(skill)
                loaded_names.add(normalized_name)

        return results

    def _matches(self, skill: dict, keyword: str) -> bool:
        """keyword 为空时全量返回；否则多字段联合匹配"""
        if not keyword:
            return True
        kw = keyword.lower()
        return any(
            kw in str(skill.get(f, "")).lower()
            for f in ("name", "description", "name_cn", "description_cn", "dir_name")
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
                    "name_cn": s["name_cn"],
                    "description_cn": s["description_cn"],
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
        """系统 skill 已在本地，直接返回本地路径"""
        skill_id = self._get_id(ref)

        # 优先从 candidate extra 中取精确路径
        if isinstance(ref, SkillCandidate) and ref.extra.get("local_path"):
            local_path = Path(ref.extra["local_path"])
            if await async_exists(local_path):
                return FetchedSkill(
                    local_path=local_path,
                    version="system",
                    source_url=f"system://{skill_id}",
                )

        # 按 read_skills 的读取优先级查找全部本地目录。
        for skills_root in self._get_local_skills_roots():
            candidate = skills_root / skill_id
            if await async_exists(candidate):
                return FetchedSkill(
                    local_path=candidate,
                    version="system",
                    source_url=f"system://{skill_id}",
                )

        raise FileNotFoundError(
            f"[system_skills] skill '{skill_id}' 不存在于任何本地 Skill 目录"
        )

    async def resolve_latest(self, ref: SkillCandidate | str) -> str | None:
        return None
