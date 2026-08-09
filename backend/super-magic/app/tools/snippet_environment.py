import re
from pathlib import Path
from typing import Any, Literal

from app.utils.async_file_utils import (
    async_chmod,
    async_create_temp_text_file,
    async_gettempdir,
    async_mkdir,
)


CURRENT_MODEL_ENV_NAME = "SUPER_MAGIC_CURRENT_MODEL_ID"
_TOOL_CALL_USAGE_PATTERN = re.compile(r"\btool\.call\s*\(")


class SnippetEnvironment:
    """代码片段子进程环境变量构建辅助类。"""

    @staticmethod
    def resolve_working_dir(workspace_dir: str, cwd: str | None) -> Path:
        """解析代码片段工作目录：相对路径锚定 workspace，绝对路径直接使用。"""
        workspace_path = Path(workspace_dir)
        if cwd is None or not cwd.strip():
            return workspace_path

        requested_path = Path(cwd)
        if requested_path.is_absolute():
            return requested_path
        return workspace_path / requested_path

    @staticmethod
    async def create_temporary_script(
        python_code: str,
        capability: Literal["run-python", "run-sdk"],
    ) -> Path:
        """在系统临时目录中创建仅当前用户可访问的短期 Python 脚本。"""
        temp_root = await async_gettempdir()
        temp_dir = temp_root / "super-magic" / "snippets" / capability
        await async_mkdir(temp_dir, parents=True, exist_ok=True)
        await async_chmod(temp_dir, 0o700)

        return await async_create_temp_text_file(
            python_code,
            suffix=".py",
            prefix="",
            directory=temp_dir,
        )

    @staticmethod
    def format_execution_error(summary: str, error: Exception) -> str:
        """为模型和代码执行详情保留可修复的原始异常信息。"""
        return f"{summary}\n\nError details:\n{type(error).__name__}: {error}"

    @staticmethod
    def apply_current_model(extra_env: dict[str, str], agent_ctx: Any) -> None:
        """将 Agent 当前文本模型写入代码片段子进程环境。"""
        model_context = getattr(agent_ctx, "model_context", None)
        current_model_id = getattr(model_context, "current_text_model_id", None)
        if current_model_id:
            extra_env[CURRENT_MODEL_ENV_NAME] = current_model_id

    @staticmethod
    def looks_like_code_mode(python_code: str) -> bool:
        """判断代码是否包含通过 sdk.tool 调用工具的迹象。"""
        return "sdk.tool" in python_code or bool(
            _TOOL_CALL_USAGE_PATTERN.search(python_code)
        )
