"""Create a skill for the current custom agent."""

from textwrap import indent
from typing import Dict

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from pydantic import Field

from app.path_manager import PathManager
from app.tools.core import BaseTool, BaseToolParams, tool
from app.tools.agent_manager.skill_name import is_valid_skill_name
from app.utils.async_file_utils import async_exists, async_mkdir, async_write_text


class CreateSkillParams(BaseToolParams):
    skill_name: str = Field(..., description="kebab-case skill name")
    name_i18n: Dict[str, str] = Field(..., description='i18n name dict, e.g. {"zh_CN": "...", "en_US": "..."}')
    description_i18n: Dict[str, str] = Field(..., description='i18n description dict, e.g. {"zh_CN": "...", "en_US": "..."}')
    content: str = Field(..., description="SKILL.md body without frontmatter")


@tool()
class CreateSkill(BaseTool[CreateSkillParams]):
    """<!--zh
    在当前工作区的 .magic/skills 中为员工创建标准 SKILL.md。创建后调用 upload_skill 上传并绑定。
    -->
    Create a skill in .magic/skills for the current employee.
    """

    async def execute(self, tool_context: ToolContext, params: CreateSkillParams) -> ToolResult:
        from app.core.context.agent_context import AgentContext

        agent_context = tool_context.get_extension_typed("agent_context", AgentContext)
        if not agent_context or not agent_context.get_agent_code():
            return ToolResult.error("No agent code found in current context.")
        if not is_valid_skill_name(params.skill_name):
            return ToolResult.error("Skill name must be kebab-case.")

        skill_dir = PathManager.get_magic_skills_dir() / params.skill_name
        skill_file = skill_dir / "SKILL.md"
        if await async_exists(skill_file):
            return ToolResult.error(f"Skill {params.skill_name} already exists.")

        await async_mkdir(skill_dir, parents=True, exist_ok=True)
        name_en = params.name_i18n.get("en_US", "")
        name_cn = params.name_i18n.get("zh_CN", "")
        desc_en = params.description_i18n.get("en_US", "")
        desc_cn = params.description_i18n.get("zh_CN", "")
        await async_write_text(
            skill_file,
            "---\n"
            f"name: {params.skill_name}\n"
            "description: |\n"
            f"{indent(desc_en, '  ')}\n"
            f"name-cn: {name_cn}\n"
            "description-cn: |\n"
            f"{indent(desc_cn, '  ')}\n"
            "---\n\n"
            f"{params.content.strip()}\n",
        )
        return ToolResult(content=f"Skill {params.skill_name} created at .magic/skills/{params.skill_name}/SKILL.md.")
