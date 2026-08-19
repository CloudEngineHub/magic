"""Review source pages and write visual analysis into the official manifest."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, Optional

from pydantic import Field, field_validator

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
from app.tools.core import BaseToolParams, tool
from app.tools.slide_template_builder.common import (
    SOURCE_ANALYSIS_FILE,
    SlideTemplateBuilderError,
    resolve_template_working_directory,
    resolve_workspace_template_dir,
    unreviewed_source_indexes,
    validate_template_directory,
)
from app.tools.workspace_tool import WorkspaceTool
from app.utils.async_file_utils import async_is_file, async_read_json, async_write_json

SOURCE_REVIEW_QUERY = """Analyze this source slide for HTML/CSS template reconstruction.
The first image is the full page. Remaining images are representative detail crops.
Return JSON only with this shape:
{
  "summary": "one paragraph of the page visual grammar",
  "must_preserve": ["concrete detail 1"],
  "visual_elements": [{"role": "...", "description": "..."}],
  "style_tokens": {"accent": "#...", "corner_radius_px": 0},
  "background": {},
  "palette": [],
  "typography": [],
  "composition": {},
  "image_details": [],
  "uncertainties": []
}
Focus on layout anchors, palette, typography, motifs or mascots, and details that would change the style if lost.
"""
JSON_FENCE_RE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL | re.IGNORECASE)


class ReviewSlideTemplateSourceParams(BaseToolParams):
    template_dir: str = Field(
        ...,
        description="""<!--zh: 已调用 prepare_slide_template_source 的模板目录。-->
Template directory previously prepared by prepare_slide_template_source.""",
    )
    source_indexes: list[int] = Field(
        ...,
        min_length=1,
        max_length=3,
        description="""<!--zh: 本次回顾的源页序号，从 1 开始，每批 1-3 页。优先使用 prepare 返回的 recommended_review_indexes。-->
1-based source page indexes to review in this call. Send 1-3 pages per call. Prefer prepare's recommended_review_indexes.""",
    )

    @field_validator("template_dir")
    @classmethod
    def strip_template_dir(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("template_dir is required")
        return value

    @field_validator("source_indexes")
    @classmethod
    def normalize_source_indexes(cls, values: list[int]) -> list[int]:
        unique: list[int] = []
        for index in values:
            if index < 1:
                raise ValueError("source_indexes must be 1-based")
            if index not in unique:
                unique.append(index)
        if not unique:
            raise ValueError("source_indexes is required")
        return unique


def parse_source_review_payload(raw: str) -> dict[str, Any]:
    text = (raw or "").strip()
    candidates: list[str] = []
    fence = JSON_FENCE_RE.search(text)
    if fence:
        candidates.append(fence.group(1))
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        candidates.append(text[start : end + 1])
    for candidate in candidates:
        try:
            payload = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            return _normalize_review_payload(payload, text)
    return _normalize_review_payload({}, text)


def _normalize_review_payload(payload: dict[str, Any], raw: str) -> dict[str, Any]:
    summary = str(payload.get("summary") or "").strip() or raw.strip() or "Visual review recorded."
    must_preserve = payload.get("must_preserve")
    if not isinstance(must_preserve, list) or not must_preserve:
        must_preserve = [summary]
    visual_elements = payload.get("visual_elements")
    if not isinstance(visual_elements, list) or not visual_elements:
        visual_elements = [{"role": "page", "description": summary}]
    style_tokens = payload.get("style_tokens")
    if not isinstance(style_tokens, dict) or not style_tokens:
        style_tokens = {"notes": "unparsed"}
    return {
        "summary": summary,
        "must_preserve": [str(item).strip() for item in must_preserve if str(item).strip()],
        "visual_elements": visual_elements,
        "style_tokens": style_tokens,
        "background": payload.get("background") if isinstance(payload.get("background"), dict) else {},
        "palette": payload.get("palette") if isinstance(payload.get("palette"), list) else [],
        "typography": payload.get("typography") if isinstance(payload.get("typography"), list) else [],
        "composition": payload.get("composition") if isinstance(payload.get("composition"), dict) else {},
        "image_details": payload.get("image_details") if isinstance(payload.get("image_details"), list) else [],
        "uncertainties": payload.get("uncertainties") if isinstance(payload.get("uncertainties"), list) else [],
    }


def representative_crop_files(crops: list[Any]) -> list[str]:
    records = [item for item in crops if isinstance(item, dict) and item.get("file")]
    if not records:
        return []
    rows = [item.get("row") for item in records if isinstance(item.get("row"), int)]
    cols = [item.get("column") for item in records if isinstance(item.get("column"), int)]
    if not rows or not cols:
        return [str(item["file"]) for item in records[:4]]
    by_key = {
        (item.get("row"), item.get("column")): str(item["file"])
        for item in records
        if isinstance(item.get("row"), int) and isinstance(item.get("column"), int)
    }
    keys = [
        (min(rows), min(cols)),
        (min(rows), max(cols)),
        (max(rows), min(cols)),
        (max(rows), max(cols)),
    ]
    files: list[str] = []
    seen: set[str] = set()
    for key in keys:
        file = by_key.get(key)
        if file and file not in seen:
            seen.add(file)
            files.append(file)
    return files


async def inspect_source_images(images: list[str], query: str) -> ToolResult:
    from app.tools.visual_understanding import VisualUnderstanding, VisualUnderstandingParams

    return await VisualUnderstanding().execute_purely(
        VisualUnderstandingParams(images=images, query=query),
        include_download_info_in_content=False,
        include_dimensions_info_in_content=False,
    )


@tool(name="review_slide_template_source", code_mode_only=True)
class ReviewSlideTemplateSource(WorkspaceTool[ReviewSlideTemplateSourceParams]):
    """<!--zh
    回顾源 PPT 指定页面：工具自行带上官方整页图和代表裁剪，写入视觉分析，并返回给人看的摘要。
    -->
    Review selected source pages. The tool attaches official full-page images and representative crops, writes visual analysis, and returns a human-readable summary.
    """

    name = "review_slide_template_source"

    async def execute(self, tool_context: ToolContext, params: ReviewSlideTemplateSourceParams) -> ToolResult:
        template_dir = resolve_workspace_template_dir(Path(self.base_dir), params.template_dir)
        try:
            metadata = await async_read_json(template_dir / "template.json")
            validate_template_directory(template_dir, metadata)
            work_dir = resolve_template_working_directory(template_dir, str(metadata.get("template_id") or ""))
            analysis_file = work_dir / SOURCE_ANALYSIS_FILE
            if not await async_is_file(analysis_file):
                raise SlideTemplateBuilderError("Call prepare_slide_template_source before reviewing source pages.")
            analysis = await async_read_json(analysis_file)
            slides = analysis.get("slides")
            if not isinstance(slides, list) or not slides:
                raise SlideTemplateBuilderError("source-analysis.json must contain analyzed source slides.")
            slides_by_index = {
                int(slide.get("source_index")): slide
                for slide in slides
                if isinstance(slide, dict) and isinstance(slide.get("source_index"), int)
            }
            missing = [index for index in params.source_indexes if index not in slides_by_index]
            if missing:
                raise SlideTemplateBuilderError(
                    "Unknown source_indexes: "
                    + ", ".join(str(index) for index in missing)
                    + f". Valid range is 1-{len(slides)}."
                )

            summaries: list[str] = []
            preserve_notes: list[str] = []
            for index in params.source_indexes:
                slide = slides_by_index[index]
                full_image = str(slide.get("full_image") or "")
                if not full_image:
                    raise SlideTemplateBuilderError(f"Source analysis full image is missing for slide {index}.")
                crop_files = representative_crop_files(
                    slide.get("detail_crops") if isinstance(slide.get("detail_crops"), list) else []
                )
                image_paths = [str(work_dir / full_image), *[str(work_dir / path) for path in crop_files]]
                result = await inspect_source_images(image_paths, SOURCE_REVIEW_QUERY)
                if not result.ok:
                    raise SlideTemplateBuilderError(
                        f"Visual review failed for source page {index}: {result.content}"
                    )
                payload = parse_source_review_payload(str(result.content or ""))
                visual = slide.get("visual_analysis")
                if not isinstance(visual, dict):
                    visual = {}
                    slide["visual_analysis"] = visual
                visual.update({"status": "complete", **payload})
                summaries.append(f"Page {index}: {payload['summary']}")
                preserve_notes.extend(str(item) for item in payload["must_preserve"][:6])

            await async_write_json(analysis_file, analysis, ensure_ascii=False, indent=2)
            remaining = unreviewed_source_indexes(slides)
            remaining_note = (
                f" Remaining unreviewed pages: {', '.join(str(index) for index in remaining)}."
                if remaining
                else " All prepared source pages have been reviewed."
            )
            data = {
                "template_directory": str(template_dir),
                "reviewed_source_indexes": list(params.source_indexes),
                "unreviewed_source_indexes": remaining,
                "must_preserve": preserve_notes,
            }
            return ToolResult(
                content=(
                    "Source visual review updated. "
                    + " ".join(summaries)
                    + " Must preserve: "
                    + "; ".join(preserve_notes)
                    + "."
                    + remaining_note
                ),
                data=data,
                extra_info=data,
            )
        except SlideTemplateBuilderError as exc:
            return ToolResult.error(str(exc))
        except Exception as exc:
            return ToolResult.error(f"Failed to review slide template source: {exc}")

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: Dict[str, Any] | None = None
    ) -> Dict:
        template_dir = str((arguments or {}).get("template_dir") or "-")
        return {
            "tool_name": tool_name,
            "action": i18n.translate("review_slide_template_source", category="tool.actions"),
            "remark": i18n.translate(
                "review_slide_template_source.before",
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
        template_dir = str((arguments or {}).get("template_dir") or "-")
        key = (
            "review_slide_template_source.after_success"
            if result.ok
            else "review_slide_template_source.after_failed"
        )
        return {
            "tool_name": tool_name,
            "action": i18n.translate("review_slide_template_source", category="tool.actions"),
            "remark": i18n.translate(key, category="tool.messages", template_dir=template_dir),
        }

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: Dict[str, Any] | None = None
    ) -> Optional[ToolDetail]:
        data = result.data if isinstance(result.data, dict) else {}
        if result.ok:
            content = "\n".join([
                "# Slide template source review",
                "",
                f"- Reviewed pages: {', '.join(str(item) for item in data.get('reviewed_source_indexes', [])) or '-'}",
                f"- Remaining pages: {', '.join(str(item) for item in data.get('unreviewed_source_indexes', [])) or 'none'}",
                f"- Must preserve: {'; '.join(data.get('must_preserve', [])) or '-'}",
            ])
        else:
            content = f"# Source review failed\n\n{result.content}"
        return ToolDetail(
            type=DisplayType.MD,
            data=FileContent(file_name="slide_template_source_review.md", content=content),
        )
