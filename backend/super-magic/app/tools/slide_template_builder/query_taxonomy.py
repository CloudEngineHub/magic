"""Query the bundled slide template category and tag taxonomy.

Skill: agents/skills/slide-template-maker/SKILL.md
"""

from __future__ import annotations

from typing import Any, Dict, Literal, Optional

from pydantic import Field, field_validator, model_validator

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.core.entity.message.server_message import DisplayType, FileContent, ToolDetail
from app.i18n import i18n
from app.tools.core import BaseTool, BaseToolParams, tool
from app.tools.slide_template_builder.common import SlideTemplateBuilderError, validate_taxonomy_selection
from app.tools.slide_template_builder.taxonomy import (
    active_categories,
    format_named_line,
    group_codes,
    list_tags,
    public_tag,
    search_tags,
    tag_groups,
    tag_records_by_code,
)

TaxonomyAction = Literal["lookup", "validate"]


class QuerySlideTemplateTaxonomyParams(BaseToolParams):
    action: TaxonomyAction = Field(
        "lookup",
        description="""<!--zh: lookup 查询分类/分组/标签；validate 核对已选分类和标签。-->
lookup lists or searches categories and tags. validate checks one category plus tag codes.""",
    )
    queries: list[str] = Field(
        default_factory=list,
        description="""<!--zh: 一次可传多个关键词，按 code 和中英文名搜索。单个关键词无结果不会中断其它关键词。-->
Optional search keywords. Send several in one call. A miss does not abort the other keywords.""",
    )
    groups: list[str] = Field(
        default_factory=list,
        description="""<!--zh: 按标签组过滤，例如 purpose_group。不传 queries 时列出这些组的全部标签。-->
Optional tag group codes such as purpose_group. With no queries, list every tag in these groups.""",
    )
    category_code: str | None = Field(
        None,
        description="""<!--zh: validate 时必填，必须是内置有效分类 code。-->
Required for validate. Must be an exact active category code.""",
    )
    tag_codes: list[str] | None = Field(
        None,
        description="""<!--zh: validate 时必填，必须是内置有效标签 code，至少一个且不重复。-->
Required for validate. Exact bundled tag codes, at least one, no duplicates.""",
    )

    @field_validator("queries", "groups")
    @classmethod
    def normalize_unique_strings(cls, values: list[str]) -> list[str]:
        unique: list[str] = []
        for item in values:
            text = str(item).strip()
            if text and text not in unique:
                unique.append(text)
        return unique

    @field_validator("category_code")
    @classmethod
    def strip_category_code(cls, value: str | None) -> str | None:
        if value is None:
            return None
        text = value.strip()
        return text or None

    @field_validator("tag_codes")
    @classmethod
    def normalize_tag_codes(cls, values: list[str] | None) -> list[str] | None:
        if values is None:
            return None
        return [str(item).strip() for item in values]

    @model_validator(mode="after")
    def require_validate_fields(self) -> QuerySlideTemplateTaxonomyParams:
        if self.action == "validate":
            if not self.category_code:
                raise ValueError("validate requires category_code")
            if not self.tag_codes:
                raise ValueError("validate requires tag_codes")
        return self


@tool(name="query_slide_template_taxonomy", code_mode_only=True)
class QuerySlideTemplateTaxonomy(BaseTool[QuerySlideTemplateTaxonomyParams]):
    """<!--zh
    查询并核对内置幻灯片模板分类和标签。创建模板前用它选择准确 code，不要猜，也不要用执行命令去读分类表。
    -->
    Look up and validate bundled slide template category and tag codes. Call this before creating a template. Do not invent codes or query the taxonomy with shell commands.
    """

    name = "query_slide_template_taxonomy"

    async def execute(self, tool_context: ToolContext, params: QuerySlideTemplateTaxonomyParams) -> ToolResult:
        try:
            if params.action == "validate":
                return self._validate(params)
            return self._lookup(params)
        except SlideTemplateBuilderError as exc:
            return ToolResult.error(str(exc))

    def _lookup(self, params: QuerySlideTemplateTaxonomyParams) -> ToolResult:
        unknown_groups = sorted(set(params.groups) - group_codes())
        if unknown_groups:
            known = ", ".join(item["code"] for item in tag_groups())
            return ToolResult.error(
                f"Unknown tag group: {', '.join(unknown_groups)}. Known groups: {known}."
            )

        categories = active_categories()
        groups = tag_groups()
        listed_tags = list_tags(params.groups) if params.groups and not params.queries else []
        matches_by_query = search_tags(params.queries, params.groups or None) if params.queries else {}
        unmatched = [query for query, matches in matches_by_query.items() if not matches]
        data = {
            "action": "lookup",
            "categories": categories,
            "groups": groups,
            "tags": listed_tags,
            "matches_by_query": matches_by_query,
            "unmatched_queries": unmatched,
        }
        return ToolResult(content=_format_lookup_content(data, params), data=data)

    def _validate(self, params: QuerySlideTemplateTaxonomyParams) -> ToolResult:
        category_code, tag_codes = validate_taxonomy_selection(params.category_code, params.tag_codes)
        category = next(item for item in active_categories() if item["code"] == category_code)
        records = tag_records_by_code()
        tags = [public_tag(records[code]) for code in tag_codes]
        data = {
            "action": "validate",
            "valid": True,
            "category": category,
            "tags": tags,
        }
        return ToolResult(content=_format_validate_content(data), data=data)

    async def get_before_tool_call_friendly_action_and_remark(
        self, tool_name: str, tool_context: ToolContext, arguments: Dict[str, Any] | None = None
    ) -> Dict:
        action = str((arguments or {}).get("action") or "lookup")
        key = (
            "query_slide_template_taxonomy.validate_before"
            if action == "validate"
            else "query_slide_template_taxonomy.lookup_before"
        )
        return {
            "tool_name": tool_name,
            "action": i18n.translate("query_slide_template_taxonomy", category="tool.actions"),
            "remark": i18n.translate(key, category="tool.messages"),
        }

    async def get_after_tool_call_friendly_action_and_remark(
        self,
        tool_name: str,
        tool_context: ToolContext,
        result: ToolResult,
        execution_time: float,
        arguments: Dict[str, Any] | None = None,
    ) -> Dict:
        action = str((result.data or {}).get("action") or (arguments or {}).get("action") or "lookup")
        if not result.ok:
            key = "query_slide_template_taxonomy.after_failed"
        elif action == "validate":
            key = "query_slide_template_taxonomy.validate_after_success"
        else:
            key = "query_slide_template_taxonomy.lookup_after_success"
        return {
            "tool_name": tool_name,
            "action": i18n.translate("query_slide_template_taxonomy", category="tool.actions"),
            "remark": i18n.translate(key, category="tool.messages"),
        }

    async def get_tool_detail(
        self, tool_context: ToolContext, result: ToolResult, arguments: Dict[str, Any] | None = None
    ) -> Optional[ToolDetail]:
        title = "Slide template taxonomy"
        body = result.content or "Taxonomy query failed."
        return ToolDetail(
            type=DisplayType.MD,
            data=FileContent(file_name="slide_template_taxonomy.md", content=f"# {title}\n\n{body}"),
        )


def _format_lookup_content(data: dict[str, Any], params: QuerySlideTemplateTaxonomyParams) -> str:
    lines = [
        f"Active categories ({len(data['categories'])}):",
        *[format_named_line(item) for item in data["categories"]],
        "",
        (
            f"Tag groups ({len(data['groups'])}). "
            "Pass groups to list exact tag codes, or queries to search. Do not invent codes."
        ),
        *[format_named_line(item, extra=f"{item['tag_count']} tags") for item in data["groups"]],
    ]
    if data["tags"]:
        group_label = ", ".join(params.groups)
        lines.extend(
            [
                "",
                f"Tags in {group_label} ({len(data['tags'])}):",
                *[format_named_line(item) for item in data["tags"]],
            ]
        )
    if params.queries:
        lines.extend(["", "Search results:"])
        for query in params.queries:
            matches = data["matches_by_query"].get(query) or []
            if matches:
                lines.append(f'Query "{query}" ({len(matches)}):')
                lines.extend(format_named_line(item) for item in matches)
            else:
                lines.append(
                    f'Query "{query}": no matching tags. List the relevant group instead of guessing names.'
                )
    elif not params.groups:
        lines.extend(
            [
                "",
                "Typical mix: one purpose, one or two styles, one color, "
                "one or two layouts, one mood, and one language.",
            ]
        )
    return "\n".join(lines)


def _format_validate_content(data: dict[str, Any]) -> str:
    lines = [
        "Taxonomy selection is valid.",
        "",
        "Category:",
        format_named_line(data["category"]),
        "",
        f"Tags ({len(data['tags'])}):",
        *[format_named_line(item) for item in data["tags"]],
    ]
    return "\n".join(lines)
