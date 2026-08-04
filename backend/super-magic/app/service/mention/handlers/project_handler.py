"""Project mention handler"""
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from app.service.mention.base import BaseMentionHandler, logger

if TYPE_CHECKING:
    from app.core.context.agent_context import AgentContext


class ProjectHandler(BaseMentionHandler):
    """处理整项目类型的 mention（跨项目挂载）。"""

    def get_type(self) -> str:
        return "project"

    async def get_tip(self, mention: Dict[str, Any], agent_context: Optional["AgentContext"] = None) -> str:
        return "Read and understand the referenced project before proceeding"

    async def handle(self, mention: Dict[str, Any], index: int, agent_context: Optional["AgentContext"] = None) -> List[str]:
        project_path = mention.get("project_path", "") or ""
        project_name = mention.get("project_name", "") or ""

        context_lines = [f"{index}. [@project:{project_path}]"]
        if project_name:
            context_lines.append(f"   - Project name: {project_name}")
        context_lines.append(f"   - Project path: {project_path}")

        logger.info(f"用户prompt添加项目引用: {project_path}")
        return context_lines
