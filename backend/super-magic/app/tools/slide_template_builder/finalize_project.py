"""Validate a semantic slide template and generate local preview assets."""

from pathlib import Path
from typing import Any, Dict, Optional

from pydantic import Field, field_validator

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
from app.tools.core import BaseToolParams, tool
from app.tools.slide_template_builder.common import (
    SlideTemplateBuilderError,
    capture_slide,
    cleanup_template_intermediates,
    resolve_workspace_template_dir,
    validate_template_project,
    write_preview_images,
)
from app.tools.workspace_tool import WorkspaceTool
from app.utils.async_file_utils import (
    async_exists,
    async_mkdir,
    async_rename,
    async_rmtree,
    async_write_json,
)


class FinalizeSlideTemplateParams(BaseToolParams):
    template_dir: str = Field(
        ...,
        description="""<!--zh: 工作区内模板目录，例如 SLIDE-navy-quarterly-review。目录必须包含 template.json、visual-spec.md、theme.css、images/ 和 slides/。-->
Template directory inside the workspace, for example SLIDE-navy-quarterly-review. It must contain template.json, visual-spec.md, theme.css, images/, and slides/.""",
    )

    @field_validator("template_dir")
    @classmethod
    def strip_template_dir(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("template_dir is required")
        return value


@tool(name="finalize_slide_template", code_mode_only=True)
class FinalizeSlideTemplate(WorkspaceTool[FinalizeSlideTemplateParams]):
    """<!--zh
    校验最终模板 HTML，并在同一模板目录的 previews/ 下生成缩略图、拼图和逐页预览图。不创建 ZIP，也不上传后台。
    -->
    Validate final template HTML and generate thumbnail, collage, and page previews under previews/ in the same template directory. This tool does not create a ZIP or upload files.
    """

    name = "finalize_slide_template"

    async def execute(self, tool_context: ToolContext, params: FinalizeSlideTemplateParams) -> ToolResult:
        template_dir = resolve_workspace_template_dir(Path(self.base_dir), params.template_dir)
        temp_preview_dir = template_dir / ".previews-tmp"
        preview_dir = template_dir / "previews"
        browser = None
        playwright = None
        try:
            validated = await validate_template_project(template_dir)
            if await async_exists(temp_preview_dir):
                await async_rmtree(temp_preview_dir)
            await async_mkdir(temp_preview_dir / "slides", parents=True, exist_ok=False)

            from playwright.async_api import async_playwright

            playwright = await async_playwright().start()
            try:
                browser = await playwright.chromium.launch(headless=True)
                context = await browser.new_context(
                    viewport={"width": 1920, "height": 1080},
                    device_scale_factor=1,
                )
                page = await context.new_page()
                slide_buffers = []
                inspections = []
                for index, slide in enumerate(validated.slides, 1):
                    slide_path = template_dir / slide["file"]
                    buffer, inspection = await capture_slide(page, slide_path)
                    slide_buffers.append(buffer)
                    inspections.append({"index": index, "file": slide["file"], **inspection})
                await context.close()
            finally:
                if browser is not None:
                    await browser.close()
                    browser = None
                if playwright is not None:
                    await playwright.stop()
                    playwright = None

            thumbnail_path, collage_path, slide_paths = await write_preview_images(
                temp_preview_dir,
                slide_buffers,
            )
            if await async_exists(preview_dir):
                await async_rmtree(preview_dir)
            await async_rename(temp_preview_dir, preview_dir)
            removed_temporary_paths = await cleanup_template_intermediates(template_dir)

            relative_slide_paths = [f"previews/slides/{path.name}" for path in slide_paths]
            manifest = {
                "schema_version": "1.0",
                "template_id": validated.metadata["template_id"],
                "category_code": validated.metadata["category_code"],
                "tag_codes": validated.metadata["tag_codes"],
                "template_source_dir": ".",
                "local_files": {
                    "thumbnail": "previews/thumbnail.png",
                    "collage": "previews/collage.png",
                    "preview_images": relative_slide_paths,
                },
                "backend_fields": {
                    "code": validated.metadata["template_id"],
                    "category_code": validated.metadata["category_code"],
                    "label": validated.metadata["label"],
                    "description": validated.metadata["description"],
                    "thumbnail_file_key": None,
                    "collage_file_key": None,
                    "preview_image_file_keys": [],
                    "template_file_key": None,
                    "preview_url": None,
                    "status": 1,
                    "sort": 0,
                    "tag_codes": validated.metadata["tag_codes"],
                },
                "upload_required_fields": [
                    "thumbnail_file_key",
                    "collage_file_key",
                    "preview_image_file_keys",
                    "template_file_key",
                ],
                "not_generated": {
                    "template_file_key": "A separate publish workflow packages and uploads the template source directory.",
                    "preview_url": "Assigned by the publish workflow when available.",
                    "colors": "Extracted by the backend from the uploaded thumbnail.",
                },
                "slide_count": len(validated.slides),
                "collage_slide_count": min(len(validated.slides), 9),
                "validation": {
                    "canvas": {"width": 1920, "height": 1080},
                    "slides": inspections,
                },
                "source_analysis": validated.source_analysis_summary,
                "cleanup": {
                    "removed_temporary_paths": removed_temporary_paths,
                    "working_directory_removed": bool(removed_temporary_paths),
                },
            }
            manifest_path = template_dir / "template-assets.json"
            await async_write_json(manifest_path, manifest, ensure_ascii=False, indent=2)

            data = {
                "template_id": validated.metadata["template_id"],
                "category_code": validated.metadata["category_code"],
                "tag_codes": validated.metadata["tag_codes"],
                "template_directory": str(template_dir),
                "preview_directory": str(preview_dir),
                "thumbnail": str(preview_dir / thumbnail_path.name),
                "collage": str(preview_dir / collage_path.name),
                "preview_images": [str(preview_dir / "slides" / path.name) for path in slide_paths],
                "manifest": str(manifest_path),
                "slide_count": len(slide_paths),
                "removed_temporary_paths": removed_temporary_paths,
                "zip_created": False,
            }
            return ToolResult(
                content=(
                    f"Slide template finalized: {len(slide_paths)} slides rendered. "
                    f"Preview assets and source files are together under `{template_dir}`. "
                    f"Removed {len(removed_temporary_paths)} temporary work path(s). No ZIP was created."
                ),
                data=data,
                extra_info=data,
            )
        except SlideTemplateBuilderError as exc:
            return ToolResult.error(str(exc))
        except Exception as exc:
            return ToolResult.error(f"Failed to finalize slide template: {exc}")
        finally:
            if browser is not None:
                await browser.close()
            if playwright is not None:
                await playwright.stop()
            if await async_exists(temp_preview_dir):
                await async_rmtree(temp_preview_dir)

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: Dict[str, Any] | None = None
    ) -> Dict:
        template_dir = str((arguments or {}).get("template_dir") or "-")
        return {
            "tool_name": tool_name,
            "action": i18n.translate("finalize_slide_template", category="tool.actions"),
            "remark": i18n.translate(
                "finalize_slide_template.before",
                category="tool.messages",
                template_dir=template_dir,
            ),
        }

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: Dict[str, Any] | None = None,
    ) -> Dict:
        template_id = str((result.data or {}).get("template_id") or (arguments or {}).get("template_dir") or "-")
        key = "finalize_slide_template.after_success" if result.ok else "finalize_slide_template.after_failed"
        return {
            "tool_name": tool_name,
            "action": i18n.translate("finalize_slide_template", category="tool.actions"),
            "remark": i18n.translate(key, category="tool.messages", template_id=template_id),
        }

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: Dict[str, Any] | None = None
    ) -> Optional[ToolDetail]:
        data = result.data if isinstance(result.data, dict) else {}
        if result.ok:
            content = "\n".join([
                "# Slide template assets",
                "",
                f"- Template ID: `{data.get('template_id', '')}`",
                f"- Category: `{data.get('category_code', '')}`",
                f"- Tags: {', '.join(data.get('tag_codes', []))}",
                f"- Directory: `{data.get('template_directory', '')}`",
                f"- Thumbnail: `{data.get('thumbnail', '')}`",
                f"- Collage: `{data.get('collage', '')}`",
                f"- Page previews: {data.get('slide_count', 0)}",
                f"- Temporary work paths removed: {len(data.get('removed_temporary_paths', []))}",
                "- ZIP created: no",
            ])
        else:
            content = f"# Slide template finalization failed\n\n{result.content}"
        return ToolDetail(
            type=DisplayType.MD,
            data=FileContent(file_name="slide_template_assets.md", content=content),
        )
