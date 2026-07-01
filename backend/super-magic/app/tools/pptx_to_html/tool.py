from pathlib import Path
from typing import Any, Dict, Optional

from pydantic import Field

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
from app.path_manager import PathManager
from app.tools.core import BaseToolParams, tool
from app.tools.pptx_to_html.runner import PptxToHtmlError, convert_pptx_to_html
from app.tools.workspace_tool import WorkspaceTool


class ConvertPptxToHtmlParams(BaseToolParams):
    pptx_path: str = Field(
        ...,
        description="""<!--zh: 输入 PPTX 文件路径，可使用工作区相对路径或绝对路径。-->
Input PPTX file path, supports workspace-relative path or absolute path.""",
    )
    output_dir: str = Field(
        "",
        description="""<!--zh: 输出目录，必须位于工作区内。为空时默认写入 `.workspace/pptx-html/<文件名>_html`。-->
Output directory. Must be inside workspace. Defaults to `.workspace/pptx-html/<file>_html` when empty.""",
    )
    max_slides: Optional[int] = Field(
        None,
        description="""<!--zh: 最多渲染的页数，仅用于调试；为空时渲染全部页面。-->
Maximum number of slides to render, for debugging only. Empty means render all slides.""",
    )
    override: bool = Field(
        True,
        description="""<!--zh: 输出目录已存在时是否覆盖。-->
Whether to override the output directory when it already exists.""",
    )


@tool(name="convert_pptx_to_html")
class ConvertPptxToHtml(WorkspaceTool[ConvertPptxToHtmlParams]):
    name = "convert_pptx_to_html"
    description = "Render a PPTX file to a raw HTML evidence package."
    """<!--zh
    将 PPTX 文件渲染为原始 HTML 证据包。

    输出包括：
    - `slides-html/slide-*.html`
    - `assets/images/*`
    - `pptx-html-render.json`

    该工具只负责 PPTX 到原始 HTML 的确定性转换，不负责清洗 HTML、生成模板 brief，也不生成最终平台模板。
    -->
    Render a PPTX file to a raw HTML evidence package.
    """

    @staticmethod
    def _file_name(arguments: Dict[str, Any] | None) -> str:
        return Path((arguments or {}).get("pptx_path", "presentation.pptx")).name

    @staticmethod
    def _slide_counts(payload: Dict[str, Any] | None) -> tuple[int, int]:
        data = payload if isinstance(payload, dict) else {}
        rendered = data.get("html", {}).get("rendered_slide_count", 0)
        total = data.get("presentation", {}).get("slide_count", 0)
        return int(rendered or 0), int(total or 0)

    async def execute(self, tool_context: ToolContext, params: ConvertPptxToHtmlParams) -> ToolResult:
        return await self.execute_purely(params)

    async def execute_purely(self, params: ConvertPptxToHtmlParams) -> ToolResult:
        workspace_dir = Path(getattr(self, "base_dir", None) or PathManager.get_workspace_dir())
        try:
            result = await convert_pptx_to_html(
                pptx_path=params.pptx_path,
                output_dir=params.output_dir,
                max_slides=params.max_slides,
                override=params.override,
                workspace_dir=workspace_dir,
            )
        except PptxToHtmlError as exc:
            return ToolResult.error(str(exc))

        payload = result.payload
        rendered, total = self._slide_counts(payload)
        content = (
            f"PPTX converted to HTML: {rendered}/{total} slides. "
            f"Output directory: {result.output_dir}. "
            f"Manifest: {result.manifest_path}"
        )
        return ToolResult(content=content, data=payload, extra_info={"output_dir": str(result.output_dir)})

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: Dict[str, Any] | None = None
    ) -> Dict:
        return {
            "tool_name": tool_name,
            "action": i18n.translate("convert_pptx_to_html", category="tool.actions"),
            "remark": i18n.translate(
                "convert_pptx_to_html.before",
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
        file_name = self._file_name(arguments)
        action = i18n.translate("convert_pptx_to_html", category="tool.actions")
        if not result.ok:
            return {
                "action": action,
                "remark": i18n.translate(
                    "convert_pptx_to_html.error",
                    category="tool.messages",
                    error=result.content,
                ),
            }

        rendered, total = self._slide_counts(result.data if isinstance(result.data, dict) else None)
        return {
            "action": action,
            "remark": i18n.translate(
                "convert_pptx_to_html.after_success",
                category="tool.messages",
                file_name=file_name,
                rendered=rendered,
                total=total,
            ),
        }

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: Dict[str, Any] | None = None
    ) -> Optional[ToolDetail]:
        if not result.ok:
            error_text = str(result.content or "Unknown PPTX to HTML conversion error.")
            if len(error_text) > 4000:
                error_text = f"{error_text[:4000]}\n... (truncated)"
            lines = [
                f"# {i18n.translate('convert_pptx_to_html.detail_error_title', category='tool.messages')}",
                "",
                error_text,
            ]
            return ToolDetail(
                type=DisplayType.MD,
                data=FileContent(file_name="pptx_to_html_error.md", content="\n".join(lines)),
            )

        rendered, total = self._slide_counts(result.data if isinstance(result.data, dict) else None)
        output_dir = (result.extra_info or {}).get("output_dir", "")
        lines = [
            f"# {i18n.translate('convert_pptx_to_html.detail_title', category='tool.messages')}",
            "",
            f"- Slides rendered: {rendered}/{total}",
        ]
        if output_dir:
            lines.append(f"- Output directory: `{output_dir}`")
            lines.append(f"- Manifest: `{Path(output_dir) / 'pptx-html-render.json'}`")
        return ToolDetail(
            type=DisplayType.MD,
            data=FileContent(file_name="pptx_to_html.md", content="\n".join(lines)),
        )
