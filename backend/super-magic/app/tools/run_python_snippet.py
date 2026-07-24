import asyncio
import shlex
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

from pydantic import Field

from agentlang.context.tool_context import ToolContext
from agentlang.logger import get_logger
from agentlang.tools.tool_result import ToolResult

from app.core.context.agent_context import AgentContext
from app.core.entity.tool.tool_result_types import TerminalToolResult
from app.i18n import i18n
from app.path_manager import PathManager
from app.tools.abstract_file_tool import AbstractFileTool
from app.tools.core import BaseToolParams, tool
from app.tools.python_snippet_repair import prepare_python_code
from app.tools.snippet_environment import SnippetEnvironment
from app.utils.async_file_utils import async_mkdir, async_unlink, async_write_text
from app.utils.process_executor import ProcessExecutor
from app.utils.terminal_tool_detail_generator import TerminalToolDetailGenerator

logger = get_logger(__name__)


class RunPythonSnippetParams(BaseToolParams):
    python_code: str = Field(
        ...,
        description="""<!--zh: 要执行的Python代码内容，应该是中小型的代码片段，不适用于复杂的大型脚本-->
Python code content to execute, should be small to medium code snippets, not suitable for complex large scripts"""
    )
    timeout: int = Field(
        60,
        description="""<!--zh: 脚本执行超时时间（秒），默认60秒-->
Script execution timeout (seconds), default 60 seconds"""
    )
    cwd: Optional[str] = Field(
        None,
        description="""<!--zh: 脚本执行工作目录；默认使用当前工作空间，相对路径基于工作空间解析，绝对路径直接使用。-->
Script working directory. Defaults to the current workspace. Relative paths resolve from the workspace; absolute paths are used as provided."""
    )


@tool()
class RunPythonSnippet(AbstractFileTool[RunPythonSnippetParams]):
    """<!--zh
    Python代码片段执行工具，适用于数据分析、处理、转换、快速计算、验证及文件操作和处理等场景

    重要提示：
    - 适用于中小型Python代码片段（<=200行）
    - 复杂脚本、会长期反复使用的脚本，应持久化到文件后再使用shell_exec工具执行
    - 工具在运行时目录自动创建临时脚本，默认以当前工作空间为工作目录，也可通过 cwd 指定，结束后删除临时脚本

    使用示例：
    ```python
    {
        "python_code": "import pandas as pd\\nprint('Hello World')",
    }
    ```
    -->
    Python snippet execution tool for data analysis, processing, transformation, quick calculations, validation, file operations, etc.

    Important notes:
    - Suitable for small to medium Python snippets (<=200 lines)
    - Complex scripts or scripts for long-term repeated use should be persisted to files then executed with shell_exec tool
    - The tool stores its temporary script in the runtime directory, uses the current workspace as cwd by default, accepts an explicit cwd, and deletes the script afterward

    Usage example:
    ```python
    {
        "python_code": "import pandas as pd\\nprint('Hello World')",
    }
    ```
    """

    @staticmethod
    def _prepare_python_code(python_code: str) -> str:
        return prepare_python_code(python_code, logger=logger, caller="run_python_snippet")

    @staticmethod
    def _build_python_extra_env(agent_ctx: AgentContext) -> dict[str, str]:
        """构建 Python 代码片段子进程需要的环境变量。"""
        import os

        project_root = PathManager.get_project_root()
        project_root_str = str(project_root)
        path_parts = [
            part for part in os.environ.get("PYTHONPATH", "").split(os.pathsep)
            if part
        ]
        if project_root_str in path_parts:
            path_parts = [part for part in path_parts if part != project_root_str]

        extra_env = {
            "PYTHONPATH": os.pathsep.join([project_root_str, *path_parts]),
            "SUPER_MAGIC_PROJECT_ROOT": project_root_str,
        }

        extra_env["SUPER_MAGIC_AGENT_CONTEXT_ID"] = agent_ctx.context_id
        SnippetEnvironment.apply_current_model(extra_env, agent_ctx)
        return extra_env

    async def execute(self, tool_context: ToolContext, params: RunPythonSnippetParams) -> TerminalToolResult:
        """
        执行Python代码片段

        Args:
            tool_context: 工具上下文
            params: 参数对象

        Returns:
            TerminalToolResult: 执行结果
        """
        return await self.execute_purely(params, tool_context)

    async def execute_purely(
        self,
        params: RunPythonSnippetParams,
        tool_context: ToolContext,
    ) -> TerminalToolResult:
        """
        纯粹执行Python代码片段的核心逻辑

        Args:
            params: 参数对象

        Returns:
            TerminalToolResult: 执行结果
        """
        script_file_path: Path | None = None
        command = "python"
        python_code = self._prepare_python_code(params.python_code)

        try:
            agent_ctx = tool_context.get_extension_typed("agent_context", AgentContext)
            if agent_ctx is None:
                raise RuntimeError(
                    "run_python_snippet: tool_context 中不存在 agent_context，"
                    "无法确定当前工作空间"
                )

            work_dir = SnippetEnvironment.resolve_working_dir(
                agent_ctx.get_workspace_dir(),
                params.cwd,
            )
            runtime_dir = PathManager.get_runtime_dir() / "python_scripts"
            await async_mkdir(runtime_dir, parents=True, exist_ok=True)

            script_file_path = runtime_dir / f"temp_python_{uuid.uuid4().hex}.py"
            logger.debug(f"创建临时Python脚本: {script_file_path}")

            # 第一步：写入Python代码到临时文件
            try:
                await async_write_text(script_file_path, python_code)
                logger.debug(f"成功写入Python代码到: {script_file_path}")
            except Exception as e:
                logger.exception(f"写入Python脚本失败: {e}")
                return TerminalToolResult(
                    error=f"写入Python脚本失败: {e}",
                    command=command,
                )

            # 第二步：使用 ProcessExecutor 执行Python脚本
            command = f"python {shlex.quote(str(script_file_path))}"

            logger.debug(f"执行Python脚本: {command}")
            result = await ProcessExecutor.execute_command(
                command=command,
                cwd=work_dir,
                timeout=params.timeout,
                extra_env=self._build_python_extra_env(agent_ctx),
                interruption_event=agent_ctx.get_interruption_event(),
            )

            return result

        except asyncio.CancelledError:
            raise

        except Exception as e:
            logger.exception(f"执行Python代码片段时出错: {e}")
            return TerminalToolResult(
                error=f"执行Python代码片段时出错: {e}",
                command=command,
                exit_code=-2,
            )
        finally:
            # 第三步：清理临时文件
            if script_file_path is not None:
                try:
                    await async_unlink(script_file_path)
                    logger.debug(f"已删除临时Python脚本: {script_file_path}")
                except Exception as e:
                    logger.warning(f"删除临时Python脚本失败: {script_file_path}, 错误: {e}")

    async def get_after_tool_call_friendly_action_and_remark(self, tool_name: str, tool_context: ToolContext, result: ToolResult, execution_time: float, arguments: Dict[str, Any] = None) -> Dict:
        """
        获取工具调用后的友好动作和备注
        """
        if not result.ok:
            return {
                "action": i18n.translate("run_python_snippet", category="tool.actions"),
                "remark": i18n.translate("run_python_snippet.error", category="tool.messages", error=result.content)
            }

        return {
            "action": i18n.translate("run_python_snippet", category="tool.actions"),
            "remark": "",
        }

    async def get_tool_detail(self, tool_context: ToolContext, result: ToolResult, arguments: Dict[str, Any] = None) -> Optional[Any]:
        """
        获取工具详情
        """
        return await TerminalToolDetailGenerator.get_tool_detail(tool_context, result, arguments)
