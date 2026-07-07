from pathlib import Path
from typing import Any, Dict, Optional

from pydantic import Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
from app.path_manager import PathManager
from app.tools.core import BaseToolParams, tool
from app.tools.pptx_to_slide_template.runner import (
    PptxToSlideTemplateError,
    convert_pptx_to_slide_template,
)
from app.tools.workspace_tool import WorkspaceTool


class ConvertPptxToSlideTemplateParams(BaseToolParams):
    pptx_path: str = Field(
        ...,
        description="""<!--zh: 输入 PPTX 文件路径，可使用工作区相对路径或绝对路径。-->
Input PPTX file path, supports workspace-relative path or absolute path.""",
    )
    output_dir: str = Field(
        "",
        description="""<!--zh: 输出根目录，必须位于工作区内。为空时默认写入 `slide-templates/`。本工具只写入转换草稿，不创建最终 ZIP。-->
Output root directory. Must be inside workspace. Defaults to `slide-templates/` when empty. This tool only writes the conversion draft and does not create the final ZIP.""",
    )
    template_id: str = Field(
        "",
        description="""<!--zh: 可选模板 ID。为空时根据 PPTX 文件名生成 `PPT-...` ID。-->
Optional template id. Defaults to a `PPT-...` id generated from the PPTX filename.""",
    )
    category_code: str = Field(
        "",
        description="""<!--zh: 可选模板分类编码。为空时不写入 template.json，分类可由平台或二次调整阶段决定。-->
Optional template category code. When empty, it is omitted from template.json and can be decided by the platform or post-conversion refinement.""",
    )
    max_slides: Optional[int] = Field(
        None,
        description="""<!--zh: 最多保留的页面数，仅用于调试；为空时保留全部页面。-->
Maximum number of slides to keep, for debugging only. Empty means keep all slides.""",
    )
    override: bool = Field(
        True,
        description="""<!--zh: 输出模板文件夹或平级 ZIP 已存在时是否覆盖。-->
Whether to override the template directory and sibling ZIP when they already exist.""",
    )
    debug: bool = Field(
        False,
        description="""<!--zh: 是否保留中间渲染产物。默认不保留。-->
Whether to keep intermediate rendered HTML artifacts. Defaults to false.""",
    )
    preserve_source_data_attrs: bool = Field(
        False,
        description="""<!--zh: 是否在最终 slides/*.html 中保留 PPTX 渲染阶段产生的原始 data-* 属性。默认不保留，只保留 data-role 和 data-slot 相关语义属性。-->
Whether to keep original renderer data-* attributes in final slides/*.html. Defaults to false and keeps only data-role plus data-slot semantic attributes.""",
    )
    externalize_inline_svg: bool = Field(
        True,
        description="""<!--zh: 是否将较大的非 slot inline SVG 外置到 images/vectors/，并在 HTML 中改为 img 引用。默认开启，以降低 HTML 噪音。-->
Whether to externalize large non-slot inline SVG blocks into images/vectors/ and replace them with img references. Defaults to true to reduce HTML noise.""",
    )
    create_zip: bool = Field(
        False,
        description="""<!--zh: 已废弃，必须保持 false。PPTX 转换产物需要二次调整后再形成最终模板压缩包。-->
Deprecated and must remain false. Converted PPTX templates require post-conversion refinement before final packaging.""",
    )


@tool(name="convert_pptx_to_slide_template")
class ConvertPptxToSlideTemplate(WorkspaceTool[ConvertPptxToSlideTemplateParams]):
    name = "convert_pptx_to_slide_template"
    description = "Convert a PPTX file into a reusable HTML slide template project."
    """<!--zh
    将 PPTX 文件转换为平台可用的 HTML 幻灯片模板项目。

    默认输出的是待二次调整的模板源码目录，不立即生成最终 ZIP。

    输出结构：
    - `<template-dir>/template.json`
    - `<template-dir>/theme.css`
    - `<template-dir>/images/`
    - `<template-dir>/slides/*.html`
    - `<output-root>/artifacts/<template-id>/previews/`

    `visual-spec.md` 需要在工具调用后由大模型根据转换产物的实际视觉风格分析生成。
    最终 `<template-id>-template.zip` 也必须在二次调整完成后再生成。
    -->
    Convert a PPTX file into a reusable HTML slide template project.
    """

    @staticmethod
    def _file_name(arguments: Dict[str, Any] | None) -> str:
        return Path((arguments or {}).get("pptx_path", "presentation.pptx")).name

    async def execute(self, tool_context: ToolContext, params: ConvertPptxToSlideTemplateParams) -> ToolResult:
        return await self.execute_purely(params)

    async def execute_purely(self, params: ConvertPptxToSlideTemplateParams) -> ToolResult:
        workspace_dir = Path(getattr(self, "base_dir", None) or PathManager.get_workspace_dir())
        try:
            result = await convert_pptx_to_slide_template(
                pptx_path=params.pptx_path,
                output_dir=params.output_dir,
                template_id=params.template_id,
                category_code=params.category_code,
                max_slides=params.max_slides,
                override=params.override,
                debug=params.debug,
                preserve_source_data_attrs=params.preserve_source_data_attrs,
                externalize_inline_svg=params.externalize_inline_svg,
                create_zip=params.create_zip,
                workspace_dir=workspace_dir,
            )
        except PptxToSlideTemplateError as exc:
            return ToolResult.error(str(exc))

        content = (
            f"PPTX converted to slide template draft: {result.slide_count} slides. "
            f"Template directory: {result.template_dir}. "
            f"Package: not created; refine before final packaging. "
            f"Thumbnail: {result.payload.get('thumbnail_image', '')}. "
            f"Collage: {result.payload.get('collage_image', '')}"
        )
        return ToolResult(
            content=content,
            data=result.payload,
            extra_info={
                "template_dir": str(result.template_dir),
                "zip_path": str(result.zip_path),
                "zip_created": False,
                "requires_refinement": True,
                "requires_visual_spec": True,
                "preview_dir": str(result.preview_dir),
                "template_json": str(result.template_json_path),
                "thumbnail_image": result.payload.get("thumbnail_image", ""),
                "collage_image": result.payload.get("collage_image", ""),
            },
        )

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: Dict[str, Any] | None = None
    ) -> Dict:
        return {
            "tool_name": tool_name,
            "action": i18n.translate("convert_pptx_to_slide_template", category="tool.actions"),
            "remark": i18n.translate(
                "convert_pptx_to_slide_template.before",
                category="tool.messages",
                file_name=self._file_name(arguments),
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
        action = i18n.translate("convert_pptx_to_slide_template", category="tool.actions")
        if not result.ok:
            return {
                "action": action,
                "remark": i18n.translate(
                    "convert_pptx_to_slide_template.error",
                    category="tool.messages",
                    error=result.content,
                ),
            }
        data = result.data if isinstance(result.data, dict) else {}
        return {
            "action": action,
            "remark": i18n.translate(
                "convert_pptx_to_slide_template.after_success",
                category="tool.messages",
                template_id=data.get("template_id", ""),
                slide_count=data.get("slide_count", 0),
            ),
        }

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: Dict[str, Any] | None = None
    ) -> Optional[ToolDetail]:
        if not result.ok:
            error_text = str(result.content or "Unknown PPTX to slide template conversion error.")
            if len(error_text) > 4000:
                error_text = f"{error_text[:4000]}\n... (truncated)"
            lines = [
                f"# {i18n.translate('convert_pptx_to_slide_template.detail_error_title', category='tool.messages')}",
                "",
                error_text,
            ]
            return ToolDetail(
                type=DisplayType.MD,
                data=FileContent(file_name="pptx_to_slide_template_error.md", content="\n".join(lines)),
            )

        data = result.data if isinstance(result.data, dict) else {}
        lines = [
            f"# {i18n.translate('convert_pptx_to_slide_template.detail_title', category='tool.messages')}",
            "",
            f"- Template ID: `{data.get('template_id', '')}`",
            f"- Slides: {data.get('slide_count', 0)}",
            f"- Template directory: `{data.get('template_dir', '')}`",
            f"- Package: `{data.get('zip_path', '')}`",
            f"- Package created: `{data.get('zip_created', False)}`",
            f"- Requires refinement: `{data.get('requires_refinement', True)}`",
            f"- Requires visual spec: `{data.get('requires_visual_spec', True)}`",
            f"- Metadata: `{data.get('template_json', '')}`",
            f"- Preview artifact directory: `{data.get('preview_dir', '')}`",
            f"- Thumbnail: `{data.get('thumbnail_image', '')}`",
            f"- Collage: `{data.get('collage_image', '')}`",
        ]
        warnings = data.get("warnings") if isinstance(data.get("warnings"), list) else []
        if warnings:
            lines.extend(["", "## Warnings", *[f"- {warning}" for warning in warnings[:20]]])
        return ToolDetail(
            type=DisplayType.MD,
            data=FileContent(file_name="pptx_to_slide_template.md", content="\n".join(lines)),
        )
