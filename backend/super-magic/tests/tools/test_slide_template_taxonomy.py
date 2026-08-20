import pytest
from pydantic import ValidationError

from agentlang.context.tool_context import ToolContext
from agentlang.tools.tool_result import ToolResult
from app.tools.slide_template_builder import QuerySlideTemplateTaxonomy
from app.tools.slide_template_builder.query_taxonomy import QuerySlideTemplateTaxonomyParams


def _tool() -> QuerySlideTemplateTaxonomy:
    return QuerySlideTemplateTaxonomy()


def _context() -> ToolContext:
    return ToolContext(tool_name="query_slide_template_taxonomy", arguments={})


def test_query_slide_template_taxonomy_is_code_mode_only():
    assert QuerySlideTemplateTaxonomy.code_mode_only is True


@pytest.mark.asyncio
async def test_lookup_returns_categories_and_groups_without_dumping_all_tags():
    result = await _tool().execute(_context(), QuerySlideTemplateTaxonomyParams())

    assert result.ok
    assert result.data["action"] == "lookup"
    assert any(item["code"] == "PPT-CATE-education-training" for item in result.data["categories"])
    assert any(item["code"] == "purpose_group" for item in result.data["groups"])
    assert result.data["tags"] == []
    assert "Active categories" in result.content
    assert "purpose-training-course" not in result.content
    assert "Do not invent codes" in result.content


@pytest.mark.asyncio
async def test_lookup_lists_tags_for_requested_groups():
    result = await _tool().execute(
        _context(),
        QuerySlideTemplateTaxonomyParams(groups=["layout_group", "mood_group"]),
    )

    assert result.ok
    codes = {item["code"] for item in result.data["tags"]}
    assert "layout-agenda" in codes
    assert "mood-energetic" in codes
    assert "purpose-training-course" not in codes
    assert "layout-agenda" in result.content
    assert "mood_group" in result.content


@pytest.mark.asyncio
async def test_lookup_searches_multiple_queries_without_aborting_on_a_miss():
    result = await _tool().execute(
        _context(),
        QuerySlideTemplateTaxonomyParams(queries=["培训", "封面", "orange"]),
    )

    assert result.ok
    assert any(item["code"] == "purpose-training-course" for item in result.data["matches_by_query"]["培训"])
    assert any(item["code"] == "color-orange" for item in result.data["matches_by_query"]["orange"])
    assert result.data["matches_by_query"]["封面"] == []
    assert result.data["unmatched_queries"] == ["封面"]
    assert 'Query "封面": no matching tags' in result.content
    assert "purpose-training-course" in result.content
    assert "color-orange" in result.content


@pytest.mark.asyncio
async def test_lookup_rejects_unknown_groups():
    result = await _tool().execute(
        _context(),
        QuerySlideTemplateTaxonomyParams(groups=["layout_group", "not_a_group"]),
    )

    assert result.ok is False
    assert "Unknown tag group: not_a_group" in result.content
    assert "purpose_group" in result.content


@pytest.mark.asyncio
async def test_validate_accepts_a_real_selection():
    result = await _tool().execute(
        _context(),
        QuerySlideTemplateTaxonomyParams(
            action="validate",
            category_code="PPT-CATE-education-training",
            tag_codes=[
                "purpose-training-course",
                "style-modern",
                "color-orange",
                "layout-card-grid",
                "mood-energetic",
                "language-chinese",
            ],
        ),
    )

    assert result.ok
    assert result.data["valid"] is True
    assert result.data["category"]["code"] == "PPT-CATE-education-training"
    assert result.data["tags"][0]["code"] == "purpose-training-course"
    assert "Taxonomy selection is valid." in result.content


@pytest.mark.asyncio
async def test_validate_rejects_unknown_category():
    result = await _tool().execute(
        _context(),
        QuerySlideTemplateTaxonomyParams(
            action="validate",
            category_code="PPT-CATE-not-real",
            tag_codes=["purpose-training-course"],
        ),
    )

    assert result.ok is False
    assert "query_slide_template_taxonomy" in result.content


def test_validate_requires_category_and_tags():
    with pytest.raises(ValidationError):
        QuerySlideTemplateTaxonomyParams(action="validate")


@pytest.mark.asyncio
async def test_lookup_and_validate_have_product_facing_remarks():
    tool = _tool()
    lookup = await tool.get_before_tool_call_friendly_action_and_remark(
        tool.name, _context(), {"action": "lookup"}
    )
    validate = await tool.get_after_tool_call_friendly_action_and_remark(
        tool.name,
        _context(),
        ToolResult(content="ok", data={"action": "validate"}),
        0.1,
        {"action": "validate"},
    )

    assert lookup["action"]
    assert "分类" in lookup["remark"] or "categor" in lookup["remark"].lower()
    assert validate["action"]
    assert "确认" in validate["remark"] or "confirm" in validate["remark"].lower()
