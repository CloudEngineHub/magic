"""Edit a skill for the current custom agent."""

import re

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from pydantic import Field

from app.path_manager import PathManager
from app.tools.core import BaseTool, BaseToolParams, tool


class EditSkillParams(BaseToolParams):
    skill_name: str = Field(..., description="kebab-case 技能名称")
    new_content: str = Field(..., description="包含 YAML frontmatter 的完整 SKILL.md 内容")


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
            return ToolResult(ok=False, content="未找到当前正在编辑的员工编号。")
        if not re.fullmatch(r"[a-z][a-z0-9]*(-[a-z0-9]+)*", params.skill_name):
            return ToolResult(ok=False, content="技能名称必须使用 kebab-case。")

        skill_file = PathManager.get_magic_skills_dir() / params.skill_name / "SKILL.md"
        if not skill_file.exists():
            return ToolResult(ok=False, content=f"未找到技能 {params.skill_name}。")

        content = params.new_content.strip()
        if not re.match(r"^---\s*\n.+?\n---(?:\s*\n|$)", content, re.DOTALL):
            return ToolResult(ok=False, content="SKILL.md 必须包含完整的 YAML frontmatter。")

        skill_file.write_text(f"{content}\n", encoding="utf-8")
        return ToolResult(content=f"已更新 .magic/skills/{params.skill_name}/SKILL.md。")