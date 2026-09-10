"""Create a skill for the current custom agent."""

import re
from textwrap import indent

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from pydantic import Field

from app.path_manager import PathManager
from app.tools.core import BaseTool, BaseToolParams, tool


class CreateSkillParams(BaseToolParams):
    skill_name: str = Field(..., description="kebab-case 技能名称")
    name_cn: str = Field(..., description="技能中文名称")
    description_en: str = Field(..., description="技能英文描述")
    description_cn: str = Field(..., description="技能中文描述")
    content: str = Field(..., description="不含 frontmatter 的 SKILL.md 正文")


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
            return ToolResult(ok=False, content="未找到当前正在编辑的员工编号。")
        if not re.fullmatch(r"[a-z][a-z0-9]*(-[a-z0-9]+)*", params.skill_name):
            return ToolResult(ok=False, content="技能名称必须使用 kebab-case。")

        skill_dir = PathManager.get_magic_skills_dir() / params.skill_name
        skill_file = skill_dir / "SKILL.md"
        if skill_file.exists():
            return ToolResult(ok=False, content=f"技能 {params.skill_name} 已存在。")

        skill_dir.mkdir(parents=True, exist_ok=True)
        skill_file.write_text(
            "---\n"
            f"name: {params.skill_name}\n"
            "description: |\n"
            f"{indent(params.description_en, '  ')}\n"
            f"name-cn: {params.name_cn}\n"
            "description-cn: |\n"
            f"{indent(params.description_cn, '  ')}\n"
            "---\n\n"
            f"{params.content.strip()}\n",
            encoding="utf-8",
        )
        return ToolResult(content=f"已创建 .magic/skills/{params.skill_name}/SKILL.md。")