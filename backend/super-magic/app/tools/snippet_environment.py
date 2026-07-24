import re
from pathlib import Path
from typing import Any


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
