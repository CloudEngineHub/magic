"""Edit a skill for the current custom agent."""

import re

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from pydantic import Field

from app.path_manager import PathManager
from app.tools.core import BaseTool, BaseToolParams, tool
from app.tools.agent_manager.skill_name import is_valid_skill_name
from app.utils.async_file_utils import async_exists, async_write_text


class EditSkillParams(BaseToolParams):
    skill_name: str = Field(..., description="kebab-case skill name")
    new_content: str = Field(..., description="Complete SKILL.md content including YAML frontmatter")


@tool()
class EditSkill(BaseTool[EditSkillParams]):
    """<!--zh
    完整替换当前工作区 .magic/skills 下的已有技能。编辑后调用 upload_skill 重新上传。
    -->
    Replace an existing skill in .magic/skills for the current employee.
    """

    async def execute(self, tool_context: ToolContext, params: EditSkillParams) -> ToolResult:
        from app.core.context.agent_context import AgentContext

        agent_context = tool_context.get_extension_typed("agent_context", AgentContext)
        if not agent_context or not agent_context.get_agent_code():
            return ToolResult.error("No agent code found in current context.")
        if not is_valid_skill_name(params.skill_name):
            return ToolResult.error("Skill name must be kebab-case.")

        skill_file = PathManager.get_magic_skills_dir() / params.skill_name / "SKILL.md"
        if not await async_exists(skill_file):
            return ToolResult.error(f"Skill {params.skill_name} not found.")

        content = params.new_content.strip()
        if not re.match(r"^---\s*\n.+?\n---(?:\s*\n|$)", content, re.DOTALL):
            return ToolResult.error("SKILL.md must include a complete YAML frontmatter block.")

        await async_write_text(skill_file, f"{content}\n")
        return ToolResult(content=f"Skill {params.skill_name} updated at .magic/skills/{params.skill_name}/SKILL.md.")
