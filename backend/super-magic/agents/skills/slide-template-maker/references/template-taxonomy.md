# Template Taxonomy

The authoritative snapshot is `template-taxonomy.json`. It contains all active category records and all tag groups and tags from the supplied backend reference files. Do not load the full JSON into model context unless debugging the taxonomy itself.

Query it through `query_slide_template_taxonomy` in Code Mode. Do not use `shell_exec` or read the JSON file to guess codes.

```python
from sdk.tool import tool

catalog = tool.call("query_slide_template_taxonomy", {
    "groups": ["purpose_group", "style_group", "color_group", "layout_group", "mood_group", "language_group"],
    "queries": ["quarterly", "navy"]
})
print(catalog.content)

checked = tool.call("query_slide_template_taxonomy", {
    "action": "validate",
    "category_code": "PPT-CATE-business-report",
    "tag_codes": [
        "purpose-quarterly-review",
        "style-business",
        "color-navy",
        "layout-dashboard",
        "mood-professional",
        "language-chinese"
    ]
})
print(checked.content)
```

Empty lookup returns active categories and tag groups. Pass `groups` to list exact tag codes. Pass several `queries` in one call; a miss does not abort the other keywords. If a keyword misses, list the group instead of guessing names.

## Selection rules

1. Choose one category matching the primary audience, use case, and decision. Use `scene-routing.md` only as a routing hint, then confirm the exact code with lookup.
2. Choose 4–10 tags that describe visible or intended template characteristics.
3. Usually include one purpose tag, one or two style tags, one color tag, one or two layout tags, one mood tag, and one language tag.
4. Add industry and audience/scene tags only when the template clearly targets them.
5. Use the most specific supported tag. Do not add near-synonyms only to increase tag count.
6. Do not add `featured`; it is an operational publishing decision.
7. Validate before calling `create_slide_template_project`.

To refresh the bundled snapshot from updated source files, run:

```bash
python3 scripts/template_taxonomy.py sync \
  --categories /path/to/slides-template-categories.json \
  --tags /path/to/slides-template-tags.json
```
