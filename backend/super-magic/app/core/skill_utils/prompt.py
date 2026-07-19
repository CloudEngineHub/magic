"""Render available skill metadata into the agent system prompt."""
import asyncio
import concurrent.futures
from pathlib import Path
from typing import List, Optional

from typing import Dict

from agentlang.skills.models import SkillMetadata
from agentlang.skills.loader import SkillLoader
from agentlang.agent.define import SkillsConfig
from agentlang.logger import get_logger
from agentlang.agent.syntax import SyntaxProcessor
from agentlang.environment import Environment
from app.utils.async_file_utils import async_exists, async_read_text, async_try_read_text
from app.core.skill_utils.manager import GlobalSkillManager, get_global_skill_manager, find_skill
from app.core.skill_utils.skill_directory_scan import (
    discover_skills_in_directory,
    discover_skills_in_personal,
    discover_skills_in_workspace,
)
from app.core.skill_utils.skill_sources import get_agents_dir, get_system_skills_dir, get_skills_instructions_prompt_file, get_workspace_skills_dir, get_crew_skills_dir
logger = get_logger(__name__)

MAX_SKILLS = 150
MAX_CHARS = 30000


def generate_skills_prompt(
    skills_config: SkillsConfig,
    agent_name: str = "",
) -> Optional[str]:
    """Generate the skills prompt with instructions and available skill metadata.

    Args:
        skills_config: Complete skills config from the .agent YAML frontmatter.
        agent_name: Current agent type, used to locate crew skill directories.

    Returns:
        The complete skills prompt, or None when generation fails.
    """
    try:
        def _run_in_thread():
            return asyncio.run(_do_generate(skills_config, agent_name))

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            return executor.submit(_run_in_thread).result()

    except Exception as e:
        logger.error(f"Failed to generate skills prompt: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return None


async def _do_generate(
    skills_config: SkillsConfig,
    agent_name: str,
) -> Optional[str]:
    """Load skills, build XML, and render the prompt in an isolated event loop."""
    personal_skills = await discover_skills_in_personal()

    # Personal Skills are an independent source. Keep the prompt when they exist even if
    # the Agent frontmatter does not explicitly configure system, Crew, or workspace Skills.
    if skills_config.is_empty() and not personal_skills:
        return None

    if agent_name:
        GlobalSkillManager.set_current_agent_type(agent_name)

    skill_manager = get_global_skill_manager()
    loaded_names: set = set()
    skills_metadata: List[SkillMetadata] = []

    # Preload config is independent of loading mode and is collected from the top-level preload field.
    preload_map: Dict[str, List[str]] = {
        entry.name: entry.files for entry in skills_config.preload
    }

    system_skills_dir = get_system_skills_dir()

    # ── 1. system_skills ─────────────────────────────────────────────────
    if skills_config.system_skills == "*":
        for scanned in await discover_skills_in_directory(system_skills_dir):
            if scanned.name not in loaded_names:
                skills_metadata.append(scanned)
                loaded_names.add(scanned.name)
                logger.info(f"Scanned and appended system skill: {scanned.name}")
    elif isinstance(skills_config.system_skills, list):
        for entry in skills_config.system_skills:
            if entry.path:
                skill = await _load_skill_from_path(entry.name, Path(entry.path))
            else:
                skill = await skill_manager.get_skill(entry.name, search_path=system_skills_dir)
            if skill:
                skills_metadata.append(skill)
                loaded_names.add(skill.name)
                logger.info(f"Loaded system skill: {entry.name}")
            else:
                logger.warning(f"System skill not found: {entry.name}")

    # ── 2. crew_skills ───────────────────────────────────────────────────
    if agent_name:
        try:
            crew_skills_dir = get_crew_skills_dir(agent_name)
            if skills_config.crew_skills == "*":
                for crew_skill in await discover_skills_in_directory(crew_skills_dir):
                    if crew_skill.name in loaded_names:
                        skills_metadata = [s for s in skills_metadata if s.name != crew_skill.name]
                        logger.info(f"Crew skill overrides same-named system skill: {crew_skill.name}")
                    skills_metadata.append(crew_skill)
                    loaded_names.add(crew_skill.name)
                    logger.info(f"Loaded crew skill: {crew_skill.name}")
            elif isinstance(skills_config.crew_skills, list):
                for entry in skills_config.crew_skills:
                    if entry.path:
                        skill = await _load_skill_from_path(entry.name, Path(entry.path))
                    else:
                        skill = await skill_manager.get_skill(entry.name, search_path=crew_skills_dir)
                    if skill:
                        if skill.name in loaded_names:
                            skills_metadata = [s for s in skills_metadata if s.name != skill.name]
                        skills_metadata.append(skill)
                        loaded_names.add(skill.name)
                        logger.info(f"Loaded crew skill: {entry.name}")
                    else:
                        logger.warning(f"Crew skill not found: {entry.name}")
        except ValueError as e:
            logger.warning(f"Invalid current agent identifier; skipping crew skills: {e}")

    # ── 3. workspace_skills ──────────────────────────────────────────────
    if skills_config.workspace_skills == "*":
        for ws_skill in await discover_skills_in_workspace():
            if ws_skill.name not in loaded_names:
                skills_metadata.append(ws_skill)
                loaded_names.add(ws_skill.name)
                logger.info(f"Scanned and appended workspace skill: {ws_skill.name}")
    elif isinstance(skills_config.workspace_skills, list):
        ws_skills_dir = get_workspace_skills_dir()
        for entry in skills_config.workspace_skills:
            if entry.path:
                skill = await _load_skill_from_path(entry.name, Path(entry.path))
            else:
                skill = await skill_manager.get_skill(entry.name, search_path=ws_skills_dir)
            if skill:
                if skill.name not in loaded_names:
                    skills_metadata.append(skill)
                    loaded_names.add(skill.name)
                logger.info(f"Loaded workspace skill: {entry.name}")
            else:
                logger.warning(f"Workspace skill not found: {entry.name}")

    # ── 3a. personal_skills: independent of workspace_skills config. ───────
    for personal_skill in personal_skills:
        if personal_skill.name not in loaded_names:
            skills_metadata.append(personal_skill)
            loaded_names.add(personal_skill.name)
            logger.info(f"Scanned and appended personal skill: {personal_skill.name}")

    # ── 3b. Region filtering: hide international-platform skills in mainland environments. ──
    region_filtered_names: list[str] = []
    if Environment.is_mainland():
        region_filtered_names = [s.name for s in skills_metadata if s.region == "international"]
        if region_filtered_names:
            skills_metadata = [s for s in skills_metadata if s.region != "international"]
            logger.info(f"Filtered {len(region_filtered_names)} international skills in mainland environment: {region_filtered_names}")

    # ── 3c. Filter excluded_skills after all configured and personal sources are loaded. ──
    excluded_names = set(skills_config.excluded_skills)
    if excluded_names:
        before_names = {s.name for s in skills_metadata}
        skills_metadata = [s for s in skills_metadata if s.name not in excluded_names]
        actually_excluded = excluded_names & before_names
        if actually_excluded:
            logger.info(f"Excluded {len(actually_excluded)} system skills: {actually_excluded}")

    # ── 3d. Always mount compact-chat-history after exclusions so it remains visible. ──
    _ALWAYS_MOUNT_SKILL = "compact-chat-history"
    visible_names = {skill.name for skill in skills_metadata}
    if _ALWAYS_MOUNT_SKILL not in visible_names:
        compact_skill = await skill_manager.get_skill(_ALWAYS_MOUNT_SKILL, search_path=system_skills_dir)
        if compact_skill:
            skills_metadata.append(compact_skill)
            loaded_names.add(_ALWAYS_MOUNT_SKILL)
            logger.info(f"Always mounted compact skill: {_ALWAYS_MOUNT_SKILL}")
        else:
            logger.warning(f"Always-mounted skill not found; skipping: {_ALWAYS_MOUNT_SKILL}")

    # ── 3e. Load skills referenced by preload but not loaded from any source. ──────────────────────
    # Preloaded skills do not need duplicate system_skills declarations; this is the fallback load.
    for skill_name in preload_map:
        if skill_name in loaded_names:
            continue
        skill = await find_skill(skill_name)
        if skill:
            skills_metadata.append(skill)
            loaded_names.add(skill.name)
            logger.info(f"Auto-loaded preloaded skill: {skill_name}")
        else:
            logger.warning(f"Preloaded skill not found; content cannot be expanded: {skill_name}")

    if not skills_metadata:
        logger.warning("No skills were loaded")
        return None

    # ── 4. Build skills XML ──────────────────────────────────────────────
    if len(skills_metadata) > MAX_SKILLS:
        logger.warning(f"Skill count exceeds limit ({MAX_SKILLS}); truncating")
        skills_metadata = skills_metadata[:MAX_SKILLS]

    skills_xml_parts = []
    total_chars = 0
    degraded = False
    for meta in skills_metadata:
        # Skills whose content is preloaded do not appear in the available_skills list.
        if meta.name in preload_map:
            continue

        if not degraded:
            # Full mode: include name, description, and location.
            parts = [
                "<skill>\n",
                f"<name>{meta.name}</name>\n",
                f"<description>{meta.description}</description>\n",
            ]
            location = meta.skill_file or meta.skill_dir
            if location:
                parts.append(f"<location>{location}</location>\n")
            parts.append("</skill>")
            skill_xml = "".join(parts)

            if total_chars + len(skill_xml) > MAX_CHARS:
                # Degraded mode: output names only.
                degraded = True
                logger.warning(
                    f"skills_content reached the character limit ({MAX_CHARS}); "
                    f"emitted {len(skills_xml_parts)} full skills, remaining skills degrade to name only"
                )

        if degraded:
            # Degraded mode keeps only the name to save tokens.
            skill_xml = f"<skill>\n<name>{meta.name}</name>\n</skill>"

        skills_xml_parts.append(skill_xml)
        total_chars += len(skill_xml)

    skills_content = "\n\n".join(skills_xml_parts)

    # ── 5. Render prompt template ──────────────────────────────────────────────
    try:
        prompt_file = get_skills_instructions_prompt_file()
        agents_dir = get_agents_dir()

        if not await async_exists(prompt_file):
            logger.error(f"Prompt template file does not exist: {prompt_file}")
            return None

        template_content = await async_read_text(prompt_file)
        syntax_processor = SyntaxProcessor(agents_dir=agents_dir)
        from app.path_manager import PathManager
        project_root = PathManager.get_project_root()
        workspace_dir = PathManager.get_workspace_dir()
        system_skills_dir = str(get_system_skills_dir().relative_to(project_root))
        workspace_skills_dir = str(get_workspace_skills_dir().relative_to(workspace_dir))
        crew_skills_dir = ""
        if agent_name:
            try:
                crew_skills_dir = str(get_crew_skills_dir(agent_name).relative_to(project_root))
            except (ValueError, Exception):
                logger.warning(f"Failed to resolve crew skills directory: agent_name={agent_name}")
        preloaded_skills_content = await _build_preloaded_skills_xml(
            skills_metadata, preload_map
        )

        syntax_processor.set_variables({
            "skills_content": skills_content,
            "preloaded_skills_content": preloaded_skills_content,
            "system_skills_dir": system_skills_dir,
            "workspace_skills_dir": workspace_skills_dir,
            "crew_skills_dir": crew_skills_dir,
        })

        skills_prompt = syntax_processor.process_dynamic_syntax(template_content)
        logger.info(f"Generated skills prompt with {len(skills_metadata)} skills; total length: {len(skills_prompt)} characters")

        # ── 6. Mainland SaaS environment: inject international-platform guidance. ──
        if region_filtered_names:
            from app.utils.deployment_util import is_saas_deployment, SAAS_INTERNATIONAL_SITE_URL
            if is_saas_deployment():
                filtered_list = ", ".join(region_filtered_names)
                notice = (
                    "\n\n<region_notice>\n"
                    f"The following skills are only available in the international version and are not supported in the current environment: {filtered_list}\n"
                    "When a user requests content from these platforms, politely explain that the current environment does not support them, "
                    f"and suggest visiting the international site ({SAAS_INTERNATIONAL_SITE_URL}) to use these features.\n"
                    "</region_notice>"
                )
                skills_prompt += notice
                logger.info(f"Injected SaaS international-platform guidance for skills: {region_filtered_names}")

        return skills_prompt

    except Exception as e:
        logger.error(f"Failed to generate skills prompt from template: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return None


async def _load_skill_from_path(name: str, path: Path) -> Optional[SkillMetadata]:
    """Load skill metadata from a custom directory that overrides default lookup paths."""
    skills = await discover_skills_in_directory(path)
    for s in skills:
        if s.name == name:
            return s
    logger.warning(f"Skill not found in custom path {path}: {name}")
    return None


async def _build_preloaded_skills_xml(
    skills_metadata: List[SkillMetadata],
    preload_map: Dict[str, List[str]],
) -> str:
    """Build the <preloaded_skills> XML block, not constrained by MAX_CHARS.

    Each skill maps to a <skill> block, and each preloaded file becomes one
    <file> child block. Missing files are logged and skipped instead of raising.
    """
    if not preload_map:
        return ""

    meta_by_name = {m.name: m for m in skills_metadata}
    skill_parts: List[str] = []

    for skill_name, files in preload_map.items():
        meta = meta_by_name.get(skill_name)
        if not meta:
            logger.warning(f"Skill metadata missing for preload_map entry; skipping: {skill_name}")
            continue

        file_blocks: List[str] = []
        for filename in files:
            is_skill_md = filename.upper() == "SKILL.MD"
            if is_skill_md:
                if not meta.skill_dir:
                    logger.warning(f"Skill {skill_name} has no skill_dir; cannot read SKILL.md")
                    continue
                skill_file_path = meta.skill_file or (meta.skill_dir / "SKILL.md")
                try:
                    loaded = await SkillLoader().load_from_file(skill_file_path)
                    file_content = loaded.content
                    file_path = loaded.skill_file
                except Exception as e:
                    logger.warning(f"Failed to load preloaded SKILL.md for {skill_name}: {e}")
                    continue
            else:
                if not meta.skill_dir:
                    logger.warning(f"Skill {skill_name} has no skill_dir; cannot read {filename}")
                    continue
                file_path = meta.skill_dir / filename
                file_content = await async_try_read_text(file_path)
                if file_content is None:
                    logger.warning(f"Preload file does not exist; skipping: {file_path}")
                    continue

            file_blocks.append(f'<file location="{file_path}">\n{file_content}\n</file>')

        if not file_blocks:
            continue

        parts = [f'<skill name="{skill_name}">']
        if meta.skill_dir:
            parts.append(f"<skill_dir>{meta.skill_dir}</skill_dir>")
        parts.append("")
        parts.extend(file_blocks)
        parts.append(f"</skill>")
        skill_parts.append("\n".join(parts))

    if not skill_parts:
        return ""

    header = (
        "IMPORTANT: The `<preloaded_skills>` block contains skill files already injected into this system prompt — use them directly.\n"
        "Each `<skill>` block groups all preloaded files for one skill. `<skill_dir>` is the skill's root directory.\n"
        "Each `<file location=\"...\">` sub-block holds the content of one preloaded file at that absolute path.\n"
        "- A `<skill>` that has a `<file>` whose `location` ends with `/SKILL.md`: the full documentation is already in this system prompt above.\n"
        "  No need to call `read_skills` for it — the content is already here (calling it would just reload what is already present).\n"
        "  To load additional reference files, find the relative path in SKILL.md, prepend `<skill_dir>`, and call `read_files`.\n"
        "- A `<skill>` with no `/SKILL.md` `<file>`: only reference files were preloaded; the main documentation is NOT in context yet.\n"
        "  Call `read_skills({\"skill_names\": [\"<name>\"]})` (using the `name` attribute of the `<skill>` tag) to load the full documentation."
    )
    return "<preloaded_skills>\n" + header + "\n\n" + "\n\n".join(skill_parts) + "\n\n</preloaded_skills>"
