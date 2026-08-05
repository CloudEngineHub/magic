"""记忆文件 mention 处理器。"""

from typing import TYPE_CHECKING, Any, Dict, List, Optional

from app.service.mention.base import BaseMentionHandler, logger

if TYPE_CHECKING:
    from app.core.context.agent_context import AgentContext


class MemoryFileHandler(BaseMentionHandler):
    """处理用户记忆文件类型的 mention。"""

    def get_type(self) -> str:
        """返回当前处理器支持的 mention 类型。"""
        return "memory_file"

    async def get_tip(
        self,
        mention: Dict[str, Any],
        agent_context: Optional["AgentContext"] = None,
    ) -> str:
        """提示 Agent 按需读取被引用的记忆文件。"""
        return "Read and understand the referenced memory file before proceeding"

    async def handle(
        self,
        mention: Dict[str, Any],
        index: int,
        agent_context: Optional["AgentContext"] = None,
    ) -> List[str]:
        """将记忆文件 mention 格式化为 Agent 上下文。"""
        file_path = str(mention.get("file_path") or "")
        file_name = str(mention.get("file_name") or "")

        logger.info(f"用户 prompt 添加记忆文件引用: {file_path}")
        return [
            f"{index}. [@memory_file:{file_path}]",
            f"   - Memory file: {file_name}",
            f"   - Path: {file_path}",
        ]
