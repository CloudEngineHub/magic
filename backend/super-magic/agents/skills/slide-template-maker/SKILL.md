---
name: slide-template-maker
description: "Create, reconstruct, extract, or update reusable HTML slide templates from presentation files, images, screenshots, HTML, text style briefs, existing template folders, or Super Magic slide projects. Use when the user asks to make a slide/PPT template, convert a PPT/PPTX into a template, recreate a visual style as a template, extract reusable layouts, or improve an existing template."
---

# Slide Template Maker

Create reusable slide template projects through semantic authoring and visual reconstruction. The project directory also contains the generated preview assets required by the later publishing workflow.

## Scope

Own every workflow that creates or changes a template:

- Reconstruct a template from PPTX, PPT, POTX, POT, PPSX, or another presentation file.
- Create a template from images, screenshots, HTML, or a written style brief.
- Extract a template from an existing Super Magic slide project.
- Update an existing template when the user explicitly requests an update.

Do not use this skill to browse, install, select, or apply an existing platform template. Load `slide-template` for those tasks.

## Non-Negotiable PPT Rule

Never call `convert_pptx_to_slide_template`, `pptx-to-html`, or any legacy PPTX-to-template script. Never refine converter-generated HTML into a final template.

For presentation sources, render pages only to obtain visual evidence. Analyze those images, then author new semantic HTML and CSS from scratch. The final template must not contain full-slide screenshots, converter DOM, renderer wrappers, `slide-001.html`, `Converted Slide`, or source-tracing attributes.

## Output Contract

Write one standalone project directory at the workspace root. The source files and generated preview assets share this directory:

```text
<template-id>/
├── template.json
├── visual-spec.md
├── theme.css
├── images/
├── slides/
├── previews/
│   ├── thumbnail.png
│   ├── collage.png
│   └── slides/
└── template-assets.json
```

Do not add a `slide-templates/` prefix. Do not create a ZIP, `magic.project.js`, `index.html`, `slide-bridge.js`, `preview.html`, or `packages/`. `previews/` and `template-assets.json` are required finalization outputs and must stay inside the same project directory.

During authoring, `create_slide_template_project` also creates `<template-id>/.template-work/`. Store every reference render, extracted media candidate, downloaded source copy, contact sheet, and QA scratch file there. This directory is temporary and is not part of the final package.

## Workflow

1. Inspect the source without modifying it.
2. Read the workflow reference matching the source:
   - Presentation file: `references/ppt-visual-reconstruction.md`
   - Image, screenshot, HTML, text brief, or existing template: `references/input-workflows.md`
   - Super Magic slide project: `references/project-template-workflow.md`
3. Read `references/scene-routing.md`, `references/template-taxonomy.md`, `references/template-json-spec.md`, `references/source-analysis-spec.md`, and `references/quality-guidelines.md` before writing files.
4. Determine the audience, use case, visual thesis, scene, semantic name, page inventory, asset strategy, and sensitive-content risks.
5. Query the bundled taxonomy through `scripts/template_taxonomy.py`. Select one exact active `category_code` and 4–10 exact `tag_codes`, then run the script's `validate` command. Never invent taxonomy codes or add `featured` automatically.
6. Determine a backend-compatible semantic ID before writing: use `SLIDE-` plus lowercase kebab-case words, for example `SLIDE-navy-quarterly-review`.
7. For a presentation source, render every page at high resolution with `document-converter`, then call `create_slide_template_project` with the validated category and tags. Do not create the template directory manually. Use `created.data["working_directory"]` for all intermediate files.
8. Call `prepare_slide_template_source` with the rendered page images and the original OOXML presentation whenever the input is a presentation. This extracts image candidates into `.template-work/source-analysis/source-assets/`; it does not copy every candidate into the final `images/` directory.
9. Analyze every source page in two passes: first the full page for hierarchy and composition, then its bounded detail crops for typography, texture, image-internal details, charts, and small decorations. Fill every page's `visual_analysis` with `status: complete`, `must_preserve`, `visual_elements`, and `style_tokens` before authoring. Do not analyze only representative pages.
10. Select the reconstruction mode: use `high-fidelity` when the user asks to preserve the original closely, `template-abstraction` when reusable layout families matter more than page-specific detail, and `hybrid` by default. The mode is recorded in `source-analysis.json`.
11. Review every `asset_catalog` entry and its candidate image. Classify it as `illustration`, `photo`, `texture`, `icon`, `logo`, `screenshot`, `diagram`, or `other`; rate quality as `high`, `acceptable`, or `poor`; and record a concrete reason. Then call `select_slide_template_source_assets` with one complete decision for every candidate. Select only high-quality or acceptable assets that materially preserve the source visual identity and that you will actually use in final HTML/CSS. Discard low-quality, redundant, irrelevant, sensitive, or layout-damaging assets. Never select an asset merely because it exists in the source PPT.
12. During authoring, use selected source assets when they improve fidelity. Preserve each selected asset's focal point, crop, aspect ratio, transparency, mask, overlay, and intended role. If an original asset is blurry, irrelevant, sensitive, or harms the layout, discard it and use a cleaner neutral treatment instead. Never leave an unused selected asset in `images/source-assets/`.
13. Call `finalize_slide_template` after authoring. It validates the project, category, tags, completed source analysis, selected-asset decisions, actual HTML/CSS references, and absence of extra source files; then writes `previews/` and `template-assets.json` in the same directory and removes `.template-work/` after successful finalization.
14. Keep normal output to 8-15 useful slides. Fuse repeated source pages into reusable layouts instead of copying or truncating pages.
15. Sanitize sensitive content and ask the user before keeping ambiguous logos, real people, QR codes, customer screenshots, private dashboards, or proprietary UI.
16. Inspect the generated thumbnail, collage, and representative page previews. Fix failures and run `finalize_slide_template` again.
17. Report the project directory, metadata, slide inventory, source interpretation, selected and discarded assets with reasons, generated preview paths, validation results, and any remaining limitations.
18. Delete any tracked temporary path created outside `created.data["working_directory"]`, then verify that neither those paths nor `.template-work/` remain. Never delete the user-provided source file or any final file listed by `template.json` or `template-assets.json`.

## Authoring Rules

- Use a fixed 1920x1080 canvas with no responsive layout.
- Make `visual-spec.md` the design contract: palette, typography, spacing, backgrounds, components, chart rules, image treatment, page rhythm, editing guidance, and forbidden patterns.
- Keep reusable visual-system CSS in `theme.css`; keep page-specific grid, flex, padding, and positioning in each slide HTML file.
- Use lowercase kebab-case filenames for English-context templates. Chinese-context templates may use concise Chinese semantic filenames such as `封面.html`, while `layout` remains lowercase kebab-case.
- Give every slide a clear visual anchor and a layout purpose distinct from adjacent slides.
- Add at least three meaningful editable regions per slide using `data-slot`, `data-slot-type`, `data-slot-role`, and `data-content-hint`.
- Store all images and SVG files under `images/`; reference them from slides with `../images/...`.
- Keep default visible sample content in English unless the user requests another language.
- Keep template CSS and assets local. Do not add mandatory CDN dependencies or `slide-bridge.js` to template pages.
- Never use remote images, absolute local paths, empty image placeholders, fake URLs, lorem ipsum, or source-download-site text.
- When the source deck contains a reusable image or illustration, prefer it when it is high quality, visually relevant, safe, and actually improves the page. Ask before retaining ambiguous private dashboards, customer screenshots, personal photos, logos, QR codes, or other sensitive material; if rejected, record the replacement decision in `visual-spec.md`. Do not force an original asset into a layout that becomes worse because of it.

## Required tool sequence

Call the tools through Code Mode:

```python
from sdk.tool import tool

created = tool.call("create_slide_template_project", {
    "template_id": "SLIDE-navy-quarterly-review",
    "category_code": "PPT-CATE-business-report",
    "tag_codes": [
        "purpose-quarterly-review",
        "style-business",
        "color-navy",
        "layout-dashboard",
        "mood-professional",
        "language-english"
    ],
    "label": {"zh_CN": "深蓝经营复盘", "en_US": "Navy Business Review"},
    "description": {"zh_CN": "适合经营复盘和指标分析。", "en_US": "A reusable template for operating reviews and metric analysis."},
    "source": {"kind": "derived", "method": "visual-reconstruction", "file": "source-deck.pptx"},
    "slides": [
        {"file": "slides/cover.html", "title": "Business Review", "layout": "cover", "description": "Opening cover."}
    ]
})

# Author final files under created.data["template_directory"]. Keep temporary renders and extraction candidates under:
working_directory = created.data["working_directory"]

# Then finalize; successful finalization removes working_directory:
finalized = tool.call("finalize_slide_template", {
    "template_dir": created.data["template_directory"]
})
```

For a presentation source, the required Code Mode sequence between project creation and authoring is:

```python
prepared = tool.call("prepare_slide_template_source", {
    "template_dir": created.data["template_directory"],
    "page_images": rendered_page_paths,
    "source_presentation": source_pptx_path,
    "reconstruction_mode": "hybrid"
})

# Review every prepared.data["asset_catalog"] entry, then choose only assets
# that will be used in the final template.
selected = tool.call("select_slide_template_source_assets", {
    "template_dir": created.data["template_directory"],
    "decisions": asset_decisions
})
```

`prepare_slide_template_source` is a read-only evidence-preparation tool. It never generates HTML or a final slide. It stores extracted images as temporary candidates and returns `asset_analysis_batches` for visual review. Complete page analysis and call `select_slide_template_source_assets` before authoring when candidates exist. Finalization rejects pages that remain `pending`, incomplete asset decisions, selected assets that are not referenced, or extra files left in `images/source-assets/`.

`finalize_slide_template` does not create a ZIP or upload files. Its `template-assets.json` records the validated `category_code` and `tag_codes`, local thumbnail, collage, page previews, cleanup result, a complete `SaveSlidesTemplateRequest`-compatible field set, and the fields that still require a separate upload/publish workflow. Local preview paths are not file keys; the publish workflow fills the `*_file_key` values after uploading the corresponding files.

## Tool Guidance

- Use the `document-converter` skill through `run_sdk_snippet` to render presentation pages and analyze them with its document-image workflow.
- Use `visual_understanding` for standalone images and screenshots, not as a replacement for `document-converter` when reading presentation files.
- Call `visual_understanding_webpage` and `analysis_slide_webpage` only through `run_sdk_snippet` with `sdk.tool.call(...)`; they are not directly mounted on the slide agent.
- Use `visual_understanding_webpage` through that Code Mode path to inspect source HTML and sampled final slides visually.
- Use `analysis_slide_webpage` through that Code Mode path for 1920x1080 overflow, clipping, scrollbar, and broken-image checks.
- Use `generate_images` only for neutral, non-sensitive visual assets when the source does not provide enough usable imagery.
- Use `ask_user` only for material decisions such as ambiguous sensitive assets, intentional template updates, or an occupied user-provided target.

For webpage visual QA, call the tools in `run_sdk_snippet` like this:

```python
run_sdk_snippet(python_code="""
from sdk.tool import tool

visual_result = tool.call("visual_understanding_webpage", {
    "target": "<template-id>/slides/cover.html",
    "query": "Review visual hierarchy, readability, composition, canvas usage, and image quality."
})
if not visual_result.ok:
    raise SystemExit(visual_result.content)
print(visual_result.content)

layout_result = tool.call("analysis_slide_webpage", {
    "target": "<template-id>/slides/cover.html",
    "max_width": 1920,
    "max_height": 1080
})
if not layout_result.ok:
    raise SystemExit(layout_result.content)
print(layout_result.content)
""")
```

## Completion Gate

Do not report completion until:

- `template.json` validates against `references/template-json.schema.json`.
- `category_code` and every `tag_codes` value exist in the bundled taxonomy, and `tag_codes` is non-empty.
- When a source PPTX was supplied, every extracted source asset has a completed `reuse` or `discard` decision. Only selected assets that are actually referenced by final HTML/CSS may remain under `images/source-assets/`; discarded and unused candidates must not be copied into the final package.
- Every indexed slide exists, loads `../theme.css`, and resolves local assets.
- No legacy conversion residue or forbidden output file remains.
- `.template-work/` and other intermediate authoring files are absent after successful finalization.
- Every external converter, extraction, download, and QA artifact path tracked during the task has been deleted without touching the source input or final template files.
- Sampled cover, dense-content, data/process, visual, and closing pages pass layout and visual review.
- The template has a coherent design system and meaningful layout diversity, not only structurally valid files.
