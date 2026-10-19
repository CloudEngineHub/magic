"""人设头像绑定与报告快照；提示词见 persona-research/reference/persona-portraits.md。"""

from __future__ import annotations

import asyncio
import hashlib
import io
import re
from pathlib import Path

from PIL import Image, ImageOps
from pydantic import Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.tools.core import BaseToolParams, tool
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
from app.tools.persona_research.study_files import (
    StudyFilesError,
    now_iso,
    read_json_file,
    resolve_in_workspace,
    transcript_lock,
    write_json_file,
)
from app.tools.workspace_tool import WorkspaceTool
from app.utils.async_file_utils import (
    async_exists,
    async_mkdir,
    async_read_bytes,
    async_realpath,
    async_stat,
    async_write_bytes,
    get_file_id_from_xattr,
)

PERSONA_ID = r"^p_[a-zA-Z0-9_-]+$"
MAX_SOURCE_BYTES = 20 * 1024 * 1024


def _webp(data: bytes) -> bytes:
    """统一交付小尺寸真实图片；只做裁切压缩，不用代码生成或改绘人脸。"""
    with Image.open(io.BytesIO(data)) as image:
        if image.format not in {"PNG", "JPEG", "WEBP"}:
            raise StudyFilesError("Use a generated PNG, JPEG, or WebP portrait.")
        if image.width * image.height > 25_000_000:
            raise StudyFilesError("The portrait exceeds 25 megapixels.")
        image = ImageOps.exif_transpose(image)
        image = ImageOps.fit(image.convert("RGB"), (320, 320), Image.Resampling.LANCZOS)
        output = io.BytesIO()
        image.save(output, format="WEBP", quality=85, method=4)
        return output.getvalue()


class AttachPersonaPortraitParams(BaseToolParams):
    persona_id: str = Field(..., pattern=PERSONA_ID)
    image_path: str = Field(..., description="Exact workspace-relative successful generate_images output.")
    replace: bool = Field(default=False, description="True only when the user requested a new appearance.")


@tool(name="attach_persona_portrait", code_mode_only=True)
class AttachPersonaPortrait(WorkspaceTool[AttachPersonaPortraitParams]):
    """Bind a generated portrait to an existing persona without changing its research content."""

    async def execute(self, tool_context: ToolContext, params: AttachPersonaPortraitParams) -> ToolResult:
        try:
            base = await async_realpath(self.base_dir)
            profile_path = await resolve_in_workspace(base, f"personas/{params.persona_id}.json")
            # 串行化同一人设的绑定；第二次非替换调用复用第一次成功结果。
            async with transcript_lock(profile_path):
                profile = await read_json_file(profile_path)
                if not profile or profile.get("id") != params.persona_id or profile.get("schema_version") != 1:
                    raise StudyFilesError("The saved persona does not exist or its id does not match.")
                previous = profile.get("portrait")
                if isinstance(previous, dict) and not params.replace:
                    relative = previous.get("file", "")
                    if isinstance(relative, str) and re.fullmatch(
                        rf"personas/portraits/{re.escape(params.persona_id)}/[a-f0-9]{{20}}\.webp",
                        relative,
                    ):
                        existing = await resolve_in_workspace(base, relative)
                        if await async_exists(existing):
                            header = await async_read_bytes(existing, size=12)
                            if header[:4] == b"RIFF" and header[8:12] == b"WEBP":
                                return ToolResult(
                                    content="Reused the persona's existing portrait.", data={"portrait": previous}
                                )
                if Path(params.image_path).is_absolute():
                    raise StudyFilesError("Use a workspace-relative image path.")
                source = await resolve_in_workspace(base, params.image_path)
                stat = await async_stat(source)
                if not 0 < stat.st_size <= MAX_SOURCE_BYTES:
                    raise StudyFilesError("The generated image must be nonempty and at most 20 MB.")
                data = await asyncio.to_thread(_webp, await async_read_bytes(source))
                digest = hashlib.sha256(data).hexdigest()[:20]
                relative = f"personas/portraits/{params.persona_id}/{digest}.webp"
                target = await resolve_in_workspace(base, relative)
                await async_mkdir(target.parent, parents=True, exist_ok=True)
                # 内容寻址的新文件先写完再绑定；失败不会覆盖旧头像或其引用，不在网络目录 rename。
                if not await async_exists(target):
                    await async_write_bytes(target, data)
                if await async_read_bytes(target) != data:
                    raise StudyFilesError("The portrait file is not fully written; the previous portrait is unchanged.")
                portrait = {"file": relative, "updated_at": now_iso()}
                file_id = await get_file_id_from_xattr(target)
                if file_id:
                    portrait["file_id"] = str(file_id)
                profile["portrait"] = portrait
                profile["updated_at"] = portrait["updated_at"]
                await write_json_file(profile_path, profile)
            return ToolResult(
                content=f"Portrait attached to {params.persona_id}: {relative}. Reuse it in all views and embed it in the report.",
                data={"portrait": portrait},
            )
        except (StudyFilesError, OSError, ValueError, Image.DecompressionBombError) as exc:
            return ToolResult.error(f"Portrait not attached; keep the existing avatar: {exc}")

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: dict | None = None
    ) -> ToolDetail:
        return portrait_detail(result)

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: dict | None = None,
    ) -> dict:
        return portrait_feedback(tool_name, result)


def portrait_detail(result: ToolResult) -> ToolDetail:
    key = "persona_portraits.updated" if result.ok else "persona_portraits.failed"
    return ToolDetail(
        type=DisplayType.MD,
        data=FileContent(
            file_name="persona-portraits.md",
            content=i18n.translate(key, category="tool.messages"),
        ),
    )


def portrait_feedback(tool_name: str, result: ToolResult) -> dict[str, str]:
    key = "persona_portraits.updated" if result.ok else "persona_portraits.failed"
    return {
        "action": i18n.translate(tool_name, category="tool.actions"),
        "remark": i18n.translate(key, category="tool.messages"),
    }
