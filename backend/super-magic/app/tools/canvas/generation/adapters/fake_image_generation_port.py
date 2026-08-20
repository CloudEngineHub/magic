"""本地 fake 生图能力适配器。"""

from pathlib import Path

from agentlang.context.tool_context import ToolContext
from app.tools.canvas.generation.contracts.generation_request import GenerationRequest
from app.tools.canvas.generation.contracts.generation_submission import GenerationSubmission
from app.tools.canvas.generation.ports.submission_port import GenerationSubmissionPort
from app.utils.async_file_utils import async_mkdir, async_write_bytes

_FAKE_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\x0dIDAT"
    b"\x08\xd7c\xf8\xcf\xc0\xf0\x1f\x00\x05\x00\x01\xff\x89\x99=\x1d\x00\x00\x00\x00IEND\xaeB`\x82"
)


class FakeImageGenerationPort(GenerationSubmissionPort):
    """本地调试用同步生图端口，不访问真实模型或外部服务。"""

    execution_mode = "sync"

    def __init__(self, workspace: Path):
        """保存工作区根目录。"""
        self.workspace = workspace

    async def submit(self, request: GenerationRequest, tool_context: ToolContext | None) -> GenerationSubmission:
        """写入最小合法 PNG 并同步返回。"""
        output = self.workspace / request.project_path / "images" / f"{request.content_id}.png"
        await async_mkdir(output.parent, parents=True, exist_ok=True)
        await async_write_bytes(output, _FAKE_PNG)
        return GenerationSubmission("sync", "completed", output_uri=output.relative_to(self.workspace).as_posix())
