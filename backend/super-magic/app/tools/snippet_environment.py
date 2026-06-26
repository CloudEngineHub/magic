from typing import Any


CURRENT_MODEL_ENV_NAME = "SUPER_MAGIC_CURRENT_MODEL_ID"


class SnippetEnvironment:
    """代码片段子进程环境变量构建辅助类。"""

    @staticmethod
    def apply_current_model(extra_env: dict[str, str], agent_ctx: Any) -> None:
        """将 Agent 当前文本模型写入代码片段子进程环境。"""
        model_context = getattr(agent_ctx, "model_context", None)
        current_model_id = getattr(model_context, "current_text_model_id", None)
        if current_model_id:
            extra_env[CURRENT_MODEL_ENV_NAME] = current_model_id
