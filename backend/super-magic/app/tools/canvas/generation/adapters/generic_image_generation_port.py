"""通用生图能力适配器。"""

from pathlib import Path

from agentlang.context.tool_context import ToolContext

from app.tools.canvas.generation.adapters.project_identity_resolver import ProjectIdentityResolver
from app.tools.canvas.generation.contracts.generation_request import GenerationRequest
from app.tools.canvas.generation.contracts.generation_submission import GenerationSubmission
from app.tools.canvas.generation.ports.submission_port import GenerationSubmissionPort


class GenericImageGenerationPort(GenerationSubmissionPort):
    """适配现有通用生图能力的同步端口。"""

    execution_mode = "sync"

    def __init__(self, workspace: Path):
        """保存工作区根目录。"""
        self.workspace = workspace
        self.project_identity_resolver = ProjectIdentityResolver()

    async def submit(self, request: GenerationRequest, tool_context: ToolContext | None) -> GenerationSubmission:
        """调用通用生图工具并返回工作区相对结果路径。"""
        from app.tools.generate_images import GenerateImages, GenerateImagesParams, ImageGenerationTask

        parameters = request.parameters
        project = self.project_identity_resolver.resolve(request.project_path)
        name = str(parameters.get("name") or request.content_id)
        output_path = str(parameters.get("output_path") or f"{project.project_path}/images")
        task = ImageGenerationTask(
            prompt=str(parameters.get("prompt") or ""),
            size=parameters.get("size"),
            name=name,
            output_path=output_path,
            reference_images=list(parameters.get("reference_images") or []),
        )
        result = await GenerateImages(base_dir=self.workspace).execute_purely(
            tool_context,
            GenerateImagesParams(tasks=[task]),
            model_id=parameters.get("model_id"),
        )
        if not result.ok:
            return GenerationSubmission("sync", "failed", error_message=result.content)
        saved = list(result.extra_info.get("saved_images") or []) if result.extra_info else []
        if not saved:
            return GenerationSubmission("sync", "failed", error_message="Image generation returned no output.")
        output = Path(saved[0])
        try:
            output_uri = output.relative_to(self.workspace).as_posix()
        except ValueError:
            return GenerationSubmission(
                "sync",
                "failed",
                error_message="Image generation returned an output outside the Canvas workspace.",
            )
        return GenerationSubmission("sync", "completed", output_uri=output_uri)
