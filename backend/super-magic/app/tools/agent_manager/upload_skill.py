"""Upload and bind a local skill to the current custom agent."""

import asyncio
import zipfile
from pathlib import Path
from typing import Dict, Optional, Tuple

import yaml
from agentlang.context.tool_context import ToolContext
from agentlang.logger import get_logger
from agentlang.tools.tool_result import ToolResult
from pydantic import Field

from app.path_manager import PathManager
from app.tools.core import BaseTool, BaseToolParams, tool
from app.tools.agent_manager.skill_name import is_valid_skill_name
from app.utils.async_file_utils import async_close_fd, async_exists, async_mkstemp, async_read_text, async_unlink

logger = get_logger(__name__)


class UploadSkillParams(BaseToolParams):
    skill_name: str = Field(..., description="kebab-case skill name to upload and bind")


@tool()
class UploadSkill(BaseTool[UploadSkillParams]):
    """<!--zh
    打包 .magic/skills 中的技能，上传到服务端，并绑定到当前正在编辑的员工。
    -->
    Upload a skill from .magic/skills and bind it to the current employee.
    """

    async def execute(self, tool_context: ToolContext, params: UploadSkillParams) -> ToolResult:
        from app.core.context.agent_context import AgentContext
        from app.infrastructure.sdk.magic_service.factory import get_magic_service_sdk
        from app.infrastructure.sdk.magic_service.parameter.add_agent_skills_parameter import AddAgentSkillsParameter
        from app.infrastructure.sdk.magic_service.parameter.import_skill_from_agent_parameter import ImportSkillFromAgentParameter

        agent_context = tool_context.get_extension_typed("agent_context", AgentContext)
        agent_code = agent_context.get_agent_code() if agent_context else None
        if not agent_code:
            return ToolResult.error("No agent code found in current context.")
        if not is_valid_skill_name(params.skill_name):
            return ToolResult.error("Skill name must be kebab-case.")

        skill_dir = PathManager.get_magic_skills_dir() / params.skill_name
        skill_file = skill_dir / "SKILL.md"
        if not await async_exists(skill_file):
            return ToolResult.error(f"Skill {params.skill_name} not found.")

        zip_path = await self._create_archive(skill_dir, params.skill_name)
        try:
            skill_content = await async_read_text(skill_file)
            name_i18n, description_i18n = self._parse_i18n_from_content(skill_content)
            sdk = get_magic_service_sdk()
            imported = await sdk.agent.import_skill_from_agent_async(
                ImportSkillFromAgentParameter(
                    file_path=zip_path,
                    source="AGENT_CREATED",
                    name_i18n=name_i18n,
                    description_i18n=description_i18n,
                )
            )
            await sdk.agent.add_agent_skills_async(
                AddAgentSkillsParameter(code=agent_code, skill_codes=[imported.code])
            )
            return ToolResult(
                content=f"Skill {imported.code} uploaded and bound to agent {agent_code}.",
                extra_info={"skill_code": imported.code, "agent_code": agent_code},
            )
        except Exception as error:
            logger.error(f"Failed to upload skill: {error}")
            return ToolResult.error(f"Failed to upload skill: {error}")
        finally:
            await async_unlink(zip_path)

    @staticmethod
    async def _create_archive(skill_dir: Path, skill_name: str) -> str:
        fd, zip_path = await async_mkstemp(suffix=".zip", prefix=f"{skill_name}-")
        await async_close_fd(fd)
        await asyncio.to_thread(_write_archive, zip_path, skill_dir, skill_name)
        return zip_path

    @staticmethod
    def _parse_i18n_from_content(content: str) -> Tuple[Optional[Dict[str, str]], Optional[Dict[str, str]]]:
        import re
        match = re.match(r"^---\s*\n(.*?)\n---", content, re.DOTALL)
        if not match:
            return None, None
        frontmatter = yaml.safe_load(match.group(1)) or {}
        name_i18n = {
            locale: value
            for locale, value in {
                "en_US": frontmatter.get("name"),
                "zh_CN": frontmatter.get("name-cn"),
            }.items()
            if value
        }
        description_i18n = {
            locale: value
            for locale, value in {
                "en_US": frontmatter.get("description"),
                "zh_CN": frontmatter.get("description-cn"),
            }.items()
            if value
        }
        return name_i18n or None, description_i18n or None


def _write_archive(zip_path: str, skill_dir: Path, skill_name: str) -> None:
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for file_path in skill_dir.rglob("*"):
            if file_path.is_file():
                archive.write(file_path, Path(skill_name) / file_path.relative_to(skill_dir))
