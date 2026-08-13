"""记忆目录 mention 处理器。"""

from typing import TYPE_CHECKING, Any, Dict, List, Optional

from app.service.mention.base import BaseMentionHandler, logger

if TYPE_CHECKING:
    from app.core.context.agent_context import AgentContext


class MemoryDirectoryHandler(BaseMentionHandler):
    """处理用户记忆目录类型的 mention。"""

    def get_type(self) -> str:
        """返回当前处理器支持的 mention 类型。"""
        return "memory_directory"

    async def get_tip(
        self,
        mention: Dict[str, Any],
        agent_context: Optional["AgentContext"] = None,
    ) -> str:
        """提示 Agent 按需检索并读取被引用的记忆目录。"""
        return "Search and read the referenced memory directory before proceeding"

    async def handle(
        self,
        mention: Dict[str, Any],
        index: int,
        agent_context: Optional["AgentContext"] = None,
    ) -> List[str]:
        """将记忆目录 mention 格式化为 Agent 上下文。"""
        directory_path = str(mention.get("directory_path") or "")
        directory_name = str(mention.get("directory_name") or "")

        logger.info(f"用户 prompt 添加记忆目录引用: {directory_path}")
        return [
            f"{index}. [@memory_directory:{directory_path}]",
            f"   - Memory directory: {directory_name}",
            f"   - Path: {directory_path}",
        ]
