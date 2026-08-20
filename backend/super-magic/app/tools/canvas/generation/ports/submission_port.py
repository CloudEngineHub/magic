"""生成提交端口抽象接口。"""

from abc import ABC, abstractmethod

from agentlang.context.tool_context import ToolContext

from app.tools.canvas.generation.contracts.generation_request import GenerationRequest
from app.tools.canvas.generation.contracts.generation_submission import GenerationSubmission


class GenerationSubmissionPort(ABC):
    """定义向外部生成能力提交任务的端口。"""

    execution_mode: str

    @abstractmethod
    async def submit(self, request: GenerationRequest, tool_context: ToolContext | None) -> GenerationSubmission:
        """提交一次生成任务。"""
