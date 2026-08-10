# Template Taxonomy

The authoritative snapshot is `template-taxonomy.json`. It contains all active category records and all tag groups and tags from the supplied backend reference files. Do not load the full JSON into model context unless debugging the taxonomy itself.

Use `scripts/template_taxonomy.py` relative to the skill directory:

```bash
python3 scripts/template_taxonomy.py categories
python3 scripts/template_taxonomy.py groups
python3 scripts/template_taxonomy.py search quarterly --group purpose_group
python3 scripts/template_taxonomy.py search 水墨 --group style_group
python3 scripts/template_taxonomy.py validate \
  --category PPT-CATE-business-report \
  --tags purpose-quarterly-review style-business color-navy layout-dashboard mood-professional language-chinese
```

## Selection rules

1. Choose one category matching the primary audience, use case, and decision. Use `scene-routing.md` only as a routing hint, then confirm the exact code with `categories`.
2. Choose 4–10 tags that describe visible or intended template characteristics.
3. Usually include one purpose tag, one or two style tags, one color tag, one or two layout tags, one mood tag, and one language tag.
4. Add industry and audience/scene tags only when the template clearly targets them.
5. Use the most specific supported tag. Do not add near-synonyms only to increase tag count.
6. Do not add `featured`; it is an operational publishing decision.
7. Run `validate` before calling `create_slide_template_project`.

To refresh the bundled snapshot from updated source files, run:

```bash
python3 scripts/template_taxonomy.py sync \
  --categories /path/to/slides-template-categories.json \
  --tags /path/to/slides-template-tags.json
```
