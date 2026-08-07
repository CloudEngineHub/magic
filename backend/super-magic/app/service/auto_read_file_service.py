"""按规则自动调用 read_file，并把结果注入当前模型上下文。"""

from __future__ import annotations

import html
from pathlib import Path
from typing import TYPE_CHECKING

from agentlang.context.tool_context import ToolContext
from agentlang.logger import get_logger
from app.tools.read_file import ReadFile, ReadFileParams
from app.utils.async_file_utils import async_exists, async_is_dir

if TYPE_CHECKING:
    from app.core.context.agent_context import AgentContext

logger = get_logger(__name__)

AUTO_READ_FILE_PATHS: tuple[str, ...] = ("AGENTS.md",)


class AutoReadFileService:
    """通过真实 ReadFile 工具同步自动读取规则，不复制文件监听逻辑。"""

    @staticmethod
    async def build_context(agent_context: "AgentContext") -> str:
        workspace_dir = Path(agent_context.get_workspace_dir())
        tool_context = ToolContext(metadata=agent_context.get_metadata())
        tool_context.register_extension("agent_context", agent_context)
        read_file = ReadFile(base_dir=workspace_dir)

        context_blocks: list[str] = []
        for relative_path in AUTO_READ_FILE_PATHS:
            file_path = workspace_dir / relative_path
            if await agent_context.horizon.is_file_tracked(file_path):
                continue

            if not await async_exists(file_path) or await async_is_dir(file_path):
                continue

            result = await read_file.execute(
                tool_context,
                ReadFileParams(
                    file_path=relative_path,
                    offset=0,
                    limit=-1,
                ),
            )
            if not result.ok:
                logger.warning(f"自动读取文件失败: path={relative_path} content={result.content}")
                continue

            context_blocks.append(
                f'<read_file_result path="{html.escape(relative_path, quote=True)}">\n'
                f"{html.escape(result.content, quote=False)}\n"
                "</read_file_result>"
            )

        if not context_blocks:
            return ""

        return "\n".join(
            [
                "<system_injected_context>",
                "<auto_read_files>",
                "The runtime automatically called read_file for the following configured files. "
                "Treat each successful read result exactly as file content you have read yourself.",
                *context_blocks,
                "</auto_read_files>",
                "</system_injected_context>",
            ]
        )
