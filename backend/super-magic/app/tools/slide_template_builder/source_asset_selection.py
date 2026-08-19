"""Review source asset candidates and copy only selected assets into the final template."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
from app.tools.core import BaseToolParams, tool
from app.tools.slide_template_builder.common import (
    ANALYSIS_DIR_NAME,
    SOURCE_ANALYSIS_FILE,
    SlideTemplateBuilderError,
    resolve_template_working_directory,
    resolve_workspace_template_dir,
    validate_template_directory,
)
from app.tools.workspace_tool import WorkspaceTool
from app.utils.async_file_utils import (
    async_copy2,
    async_exists,
    async_is_file,
    async_mkdir,
    async_read_json,
    async_rmtree,
    async_write_json,
)

ASSET_TARGET_PATTERN = r"^[a-z0-9][a-z0-9-]*\.[a-z0-9]+$"
AssetDecision = Literal["reuse", "discard"]
AssetQuality = Literal["high", "acceptable", "poor"]
AssetType = Literal[
    "illustration",
    "photo",
    "texture",
    "icon",
    "logo",
    "screenshot",
    "diagram",
    "other",
]


class SourceAssetDecisionParams(BaseModel):
    asset: str = Field(..., description="Asset identifier from source-analysis.json asset_catalog[].asset.")
    decision: AssetDecision
    asset_type: AssetType
    quality: AssetQuality
    rationale: str = Field(..., min_length=3, max_length=1000)
    target_name: Optional[str] = Field(None, description="Semantic output filename for a reused asset.")
    intended_role: Optional[str] = Field(None, max_length=500)

    @field_validator("asset", "rationale")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("value cannot be empty")
        return value

    @field_validator("target_name", "intended_role")
    @classmethod
    def strip_optional_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        return value or None

    @model_validator(mode="after")
    def validate_decision(self) -> "SourceAssetDecisionParams":
        if self.decision == "reuse":
            if self.quality == "poor":
                raise ValueError("poor-quality assets cannot be reused")
            if not self.target_name or not re.fullmatch(ASSET_TARGET_PATTERN, self.target_name):
                raise ValueError("reused assets require a semantic lowercase target_name with an extension")
            if not self.intended_role:
                raise ValueError("reused assets require intended_role")
        elif self.target_name:
            raise ValueError("discarded assets cannot define target_name")
        return self


class SelectSlideTemplateSourceAssetsParams(BaseToolParams):
    template_dir: str = Field(
        ...,
        description="""<!--zh: 已调用 prepare_slide_template_source 的模板目录。-->
Template directory previously prepared by prepare_slide_template_source.""",
    )
    decisions: list[SourceAssetDecisionParams] = Field(
        ...,
        description="""<!--zh: 对 asset_catalog 中每个素材的完整审核决策。必须覆盖全部素材。-->
Complete review decisions covering every asset in asset_catalog exactly once.""",
    )

    @field_validator("template_dir")
    @classmethod
    def strip_template_dir(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("template_dir is required")
        return value


def _resolve_source_asset(work_dir: Path, relative_path: str) -> Path:
    resolved = (work_dir / relative_path).resolve(strict=False)
    analysis_root = (work_dir / ANALYSIS_DIR_NAME / "source-assets").resolve(strict=False)
    try:
        resolved.relative_to(analysis_root)
    except ValueError as exc:
        raise SlideTemplateBuilderError(f"Source asset path escapes source-assets/: {relative_path}") from exc
    return resolved


@tool(name="select_slide_template_source_assets", code_mode_only=True)
class SelectSlideTemplateSourceAssets(WorkspaceTool[SelectSlideTemplateSourceAssetsParams]):
    """<!--zh
    审核 PPT 原素材，只把高质量且会在最终模板中使用的图片和插画复制到 images/source-assets/。
    -->
    Review original PPT assets and copy only high-quality images and illustrations selected for final use into images/source-assets/.
    """

    name = "select_slide_template_source_assets"

    async def execute(self, tool_context: ToolContext, params: SelectSlideTemplateSourceAssetsParams) -> ToolResult:
        template_dir = resolve_workspace_template_dir(Path(self.base_dir), params.template_dir)
        final_assets_dir = template_dir / "images" / "source-assets"
        try:
            metadata = await async_read_json(template_dir / "template.json")
            validate_template_directory(template_dir, metadata)
            work_dir = resolve_template_working_directory(template_dir, str(metadata.get("template_id") or ""))
            analysis_file = work_dir / SOURCE_ANALYSIS_FILE
            if not await async_is_file(analysis_file):
                raise SlideTemplateBuilderError("Call prepare_slide_template_source before selecting source assets.")
            analysis = await async_read_json(analysis_file)
            catalog = analysis.get("asset_catalog")
            if not isinstance(catalog, list):
                raise SlideTemplateBuilderError("source-analysis.json asset_catalog must be an array.")

            catalog_by_asset = {
                item.get("asset"): item
                for item in catalog
                if isinstance(item, dict) and isinstance(item.get("asset"), str)
            }
            if len(catalog_by_asset) != len(catalog):
                raise SlideTemplateBuilderError(
                    "source-analysis.json asset_catalog contains invalid or duplicate asset identifiers."
                )
            decision_by_asset = {item.asset: item for item in params.decisions}
            if len(decision_by_asset) != len(params.decisions):
                raise SlideTemplateBuilderError("Each source asset must have exactly one decision.")
            missing = sorted(set(catalog_by_asset) - set(decision_by_asset))
            unknown = sorted(set(decision_by_asset) - set(catalog_by_asset))
            if missing or unknown:
                details = []
                if missing:
                    details.append("missing decisions: " + ", ".join(missing))
                if unknown:
                    details.append("unknown assets: " + ", ".join(unknown))
                raise SlideTemplateBuilderError("Asset decisions must exactly cover asset_catalog; " + "; ".join(details))

            selected_names = [item.target_name for item in params.decisions if item.decision == "reuse"]
            if len(selected_names) != len(set(selected_names)):
                raise SlideTemplateBuilderError("Reused source assets must use unique target_name values.")

            source_paths = {}
            for asset_name, catalog_item in catalog_by_asset.items():
                decision = decision_by_asset[asset_name]
                source_file = str(catalog_item.get("source_file") or "")
                source_path = _resolve_source_asset(work_dir, source_file)
                if not await async_is_file(source_path):
                    raise SlideTemplateBuilderError(f"Extracted source asset is missing: {source_file}")
                source_extension = Path(asset_name).suffix.lower()
                target_extension = Path(decision.target_name or "").suffix.lower()
                if decision.decision == "reuse" and source_extension != target_extension:
                    raise SlideTemplateBuilderError(
                        f"target_name must keep the original extension for {asset_name}: {source_extension}"
                    )
                source_paths[asset_name] = source_path

            if await async_exists(final_assets_dir):
                await async_rmtree(final_assets_dir)
            await async_mkdir(final_assets_dir, parents=True, exist_ok=False)

            selected_files = []
            discarded_assets = []
            for asset_name, catalog_item in catalog_by_asset.items():
                decision = decision_by_asset[asset_name]
                catalog_item.update({
                    "decision": decision.decision,
                    "asset_type": decision.asset_type,
                    "quality": decision.quality,
                    "rationale": decision.rationale,
                    "intended_role": decision.intended_role or "",
                    "target_name": decision.target_name,
                    "final_file": None,
                })
                if decision.decision == "reuse":
                    final_file = f"images/source-assets/{decision.target_name}"
                    await async_copy2(source_paths[asset_name], template_dir / final_file)
                    catalog_item["final_file"] = final_file
                    selected_files.append(final_file)
                else:
                    discarded_assets.append(asset_name)

            await async_write_json(analysis_file, analysis, ensure_ascii=False, indent=2)
            data = {
                "template_id": metadata["template_id"],
                "template_directory": str(template_dir),
                "selected_files": selected_files,
                "discarded_assets": discarded_assets,
                "selected_count": len(selected_files),
                "discarded_count": len(discarded_assets),
                "source_analysis": str(analysis_file),
            }
            return ToolResult(
                content=(
                    f"Source asset review completed: selected {len(selected_files)} asset(s) and discarded "
                    f"{len(discarded_assets)} asset(s). Reference every selected file from final HTML or CSS."
                ),
                data=data,
                extra_info=data,
            )
        except SlideTemplateBuilderError as exc:
            return ToolResult.error(str(exc))
        except Exception as exc:
            return ToolResult.error(f"Failed to select slide template source assets: {exc}")

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: Dict[str, Any] | None = None
    ) -> Dict:
        template_dir = str((arguments or {}).get("template_dir") or "-")
        return {
            "tool_name": tool_name,
            "action": i18n.translate("select_slide_template_source_assets", category="tool.actions"),
            "remark": i18n.translate(
                "select_slide_template_source_assets.before",
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
            "select_slide_template_source_assets.after_success"
            if result.ok
            else "select_slide_template_source_assets.after_failed"
        )
        return {
            "tool_name": tool_name,
            "action": i18n.translate("select_slide_template_source_assets", category="tool.actions"),
            "remark": i18n.translate(key, category="tool.messages", template_dir=template_dir),
        }

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: Dict[str, Any] | None = None
    ) -> Optional[ToolDetail]:
        data = result.data if isinstance(result.data, dict) else {}
        if result.ok:
            content = "\n".join([
                "# Slide template source assets",
                "",
                f"- Selected: {data.get('selected_count', 0)}",
                f"- Discarded: {data.get('discarded_count', 0)}",
                f"- Final files: {', '.join(data.get('selected_files', [])) or '-'}",
            ])
        else:
            content = f"# Source asset selection failed\n\n{result.content}"
        return ToolDetail(
            type=DisplayType.MD,
            data=FileContent(file_name="slide_template_source_assets.md", content=content),
        )
