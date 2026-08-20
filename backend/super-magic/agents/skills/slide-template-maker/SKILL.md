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

Write one standalone project directory at the workspace root. Its semantic name is generated in Chinese or English according to the selected language tag. The name is a filesystem detail and is not added to `template.json`. The source files and generated preview assets share this directory:

```text
<semantic-template-name>/
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

Later tools only need `template_dir`. Do not write `source-analysis.json`, do not create `.template-work/` inside the template directory, and do not maintain hidden working-directory paths yourself.

## Tool ownership

`create_slide_template_project` owns the template directory, `template.json`, and the initial slide scaffolds. Do not recreate or overwrite those files with `shell_exec`, `run_python_snippet`, `write_file`, or other generic file tools. After creation, generic file tools may edit only `visual-spec.md`, `theme.css`, `images/`, and the declared `slides/*.html` files. Taxonomy lookup must go through `query_slide_template_taxonomy`. Source review and asset selection must go through `review_slide_template_source` and `select_slide_template_source_assets`. If a dedicated tool fails, retry that same tool. Do not emulate it.

The template is not complete when authoring finishes. Call `finalize_slide_template` with the returned `template_directory`, inspect `result.ok` and `result.content`, compare `previews/` with the source, and report completion only after finalization succeeds. A failed finalization is a failed template task, even when the source files exist.

## Intake Checkpoint

**CHECKPOINT:** After a quick source look and before `create_slide_template_project`, call `ask_user` once for missing direction. Do not convert the deck first. Do not put `ask_user` inside `run_sdk_snippet` or Code Mode.

Ask only what the user did not already answer, and only when the answer would change the finished template. Write questions in the user's language. Prefer `select`. Set `default` on every question and `timeout` to `900`. If the user skips, times out, or says to decide, continue with those defaults. If `ask_user` is blocked, use the same defaults without asking.

Drop a question when the user already specified it:

- Reusable / 可复用 / extract the visual system / keep the style only → skip shape; use `hybrid` and 8–15 pages.
- Page-by-page / 逐页 / keep every page / 尽量还原结构 → skip shape; use `high-fidelity` and keep source pages minus ads, watermarks, and copyright pages.
- Keep / replace source images, or explicit asset instructions → skip asset strategy.
- Concrete text briefs, screenshot style rebuilds, and HTML rebuilds skip shape unless the user also uploaded a presentation and asked for page-by-page reconstruction.
- Generic “做成模板 / 做模板 / 转成模板” without reusable or page-by-page language does not skip shape.

When shape is missing, recommend reusable 8–15 pages unless the user asked to restore the source page by page. High-fidelity still means new semantic HTML. Never use converter HTML or full-slide screenshots as finished pages.

```text
<question type="select" default="Reusable 8-15 pages">
This deck has about N pages. What should the template be?
<option>Reusable 8-15 pages — extract color, type, and components into a reusable template</option>
<option>Keep source pages — rewrite each useful page in semantic HTML, drop ads and copyright pages</option>
</question>

<question type="select" default="Keep usable source images">
How should source images be handled?
<option>Keep usable source images — logos, faces, QR codes, and private screenshots still need a later confirm</option>
<option>Replace all images with neutral placeholders</option>
</question>
```

Add a situational question only when it would change the result, such as a non-16:9 canvas, mixed Chinese/English sample copy, or an unclear training-versus-report scene.

## Workflow

The main path is three beats. Taxonomy, canvas, and asset policy live in the references.

1. Inspect the source without modifying it. Note file type, approximate page count, and obvious asset risks. Read the matching workflow reference, then `references/scene-routing.md`, `references/template-taxonomy.md`, `references/template-json-spec.md`, and `references/quality-guidelines.md`.
2. Run the Intake Checkpoint. Do not call `create_slide_template_project` until missing shape and asset questions are asked or safely defaulted.
3. Query the bundled taxonomy through `query_slide_template_taxonomy`. Do not use `shell_exec`, `run_python_snippet`, or read `template-taxonomy.json` to guess codes. Select one exact active `category_code` and 4–10 exact `tag_codes`, then call the same tool with `action: "validate"`. Never invent taxonomy codes or add `featured` automatically.
4. Determine a backend-compatible semantic base ID: `SLIDE-` plus lowercase kebab-case words. `create_slide_template_project` appends a short six-character uppercase hexadecimal suffix to the backend `template_id`, but the local directory name contains no random suffix. Use the returned `created.data["template_directory"]` for every later call.
5. Call `create_slide_template_project` with the validated category, tags, bilingual labels, and source canvas. Do not create the template directory manually.
6. If the source is a presentation with extractable assets, render pages with `document-converter` using `created.data["converter_output_dir"]` as `output_dir`. Do not create `document-converter-output/` in the workspace. Then:
   - `prepare_slide_template_source` with the page images and source OOXML. Pass `high-fidelity` after a page-by-page intake, otherwise `hybrid`.
   - `review_slide_template_source` for `recommended_review_indexes` (1–3 pages per call). Include cover, dense, data, closing, and any mascot or brand-illustration pages.
   - `select_slide_template_source_assets` with public ids such as `asset-01`. Batch until `pending_count` is `0`. Never pass converter filenames such as `<source>_image_0001.webp`.
7. Text briefs, screenshots, or HTML with no extractable assets skip beat 6.
8. Author `visual-spec.md`, `theme.css`, `images/`, and the declared `slides/*.html` files in `template_dir`. For reusable/hybrid templates, keep 8–15 useful slides and fuse repeated source pages. For high-fidelity, keep the source page count minus ads, watermarks, and copyright pages.
9. Call `finalize_slide_template`. It still hard-blocks missing prepare (for visual-reconstruction), incomplete asset decisions, unused selected assets, converter residue, canvas/taxonomy errors, and missing previews. Unreviewed source pages become warnings, not a hard stop.
10. Compare `previews/slides/` with the source. If `result.data["warnings"]` lists unreviewed pages, inspect those previews first. Fix and finalize again if needed.
11. Report the project directory, inventory, selected/discarded assets, preview paths, warnings, and remaining limits. Never delete the user-provided source file or any final file listed by `template.json` or `template-assets.json`.

Sanitize sensitive content and ask the user before keeping ambiguous logos, real people, QR codes, customer screenshots, private dashboards, or proprietary UI.

## Authoring Rules

- Use the declared source canvas from `template.json` with no responsive layout. Default to `1920x1080` only when the source does not provide dimensions, and preserve source ratios such as `1:1`.
- Preserve the generated slide canvas contract on every page. Each slide must keep one root element in the form `<main class="slide-container" data-width="..." data-height="...">`.
- Keep `data-width` and `data-height` equal to `template.json.source.canvas.width` and `template.json.source.canvas.height`. When replacing scaffold content, replace only the content inside the root canvas; do not remove or rename the `slide-container` class or either dimension attribute.
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

catalog = tool.call("query_slide_template_taxonomy", {
    "groups": [
        "purpose_group",
        "style_group",
        "color_group",
        "layout_group",
        "mood_group",
        "language_group"
    ],
    "queries": ["training", "navy", "dashboard"]
})
if not catalog.ok:
    raise SystemExit(catalog.content)
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
        "language-english"
    ]
})
if not checked.ok:
    raise SystemExit(checked.content)
print(checked.content)

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
    "source": {
        "kind": "derived",
        "method": "visual-reconstruction",
        "file": "source-deck.pptx",
        "canvas": {"width": 1920, "height": 1080}
    },
    "slides": [
        {"file": "slides/cover.html", "title": "Business Review", "layout": "cover", "description": "Opening cover."}
    ]
})
if not created.ok:
    raise SystemExit(created.content)

template_dir = created.data["template_directory"]
converter_output_dir = created.data["converter_output_dir"]
```

For a presentation source only, render pages with `document-converter` into `converter_output_dir` before prepare. Do not create `document-converter-output/` in the workspace. Other document-converter tasks keep their normal workspace output.

For a presentation source, the required Code Mode sequence between project creation and authoring is:

```python
prepared = tool.call("prepare_slide_template_source", {
    "template_dir": template_dir,
    "page_images": rendered_page_paths,
    "source_presentation": source_pptx_path,
    "reconstruction_mode": "hybrid"  # Use high-fidelity after a page-by-page intake.
})
if not prepared.ok:
    raise SystemExit(prepared.content)
print(prepared.content)

for source_index in prepared.data["recommended_review_indexes"]:
    reviewed = tool.call("review_slide_template_source", {
        "template_dir": template_dir,
        "source_indexes": [source_index]
    })
    if not reviewed.ok:
        raise SystemExit(reviewed.content)
    print(reviewed.content)

# Use exact public ids such as asset-01. Repeat until pending_count == 0.
selected = tool.call("select_slide_template_source_assets", {
    "template_dir": template_dir,
    "decisions": asset_decisions
})
if not selected.ok:
    raise SystemExit(selected.content)
print(selected.content)
```

Then author files under `template_dir` and finalize:

```python
finalized = tool.call("finalize_slide_template", {
    "template_dir": template_dir
})
if not finalized.ok:
    raise SystemExit(finalized.content)
print(finalized.content)
```

`prepare_slide_template_source` inspects the source without modifying it. It never generates HTML. Read `prepared.data["canvas"]`, `prepared.data["recommended_review_indexes"]`, and `asset-01` style catalog ids. Do not read or write the hidden working directory.

If a dedicated source tool fails, print `result.content`, fix the arguments, and retry the same tool. Do not copy converter images into the template directory and do not hand-write a replacement manifest.

`finalize_slide_template` does not create a ZIP or upload files. Its `template-assets.json` records the validated `category_code` and `tag_codes`, local thumbnail, collage, page previews, cleanup result, a complete `SaveSlidesTemplateRequest`-compatible field set, and the fields that still require a separate upload/publish workflow. Local preview paths are not file keys; the publish workflow fills the `*_file_key` values after uploading the corresponding files.

## Tool Guidance

- Call `query_slide_template_taxonomy` once to list needed groups and search several keywords together. A miss does not abort the other keywords. Empty lookup returns categories and groups only; pass `groups` to list exact tag codes. Then call the same tool with `action: "validate"` before `create_slide_template_project`.
- Use the `document-converter` skill through `run_sdk_snippet` to render presentation pages. In this template-making workflow only, set `output_dir` to `created.data["converter_output_dir"]`. Leave other document-converter tasks on their normal workspace output.
- Do not replace `review_slide_template_source` with hand-written `source-analysis.json` or ad-hoc `visual_understanding` against converter filenames.
- Use `visual_understanding` for standalone images, screenshots, and generated `previews/slides/` files.
- Call `visual_understanding_webpage` and `analysis_slide_webpage` only through `run_sdk_snippet` with `sdk.tool.call(...)`; they are not directly mounted on the slide agent.
- Use `visual_understanding_webpage` through that Code Mode path to inspect source HTML before finalization. Pass the declared canvas as `viewport_width` and `viewport_height`, with `device_scale_factor: 1`.
- Use `analysis_slide_webpage` through that Code Mode path for declared-canvas overflow, clipping, scrollbar, and broken-image checks. The tool uses `max_width` and `max_height` as its Browser viewport.
- After `finalize_slide_template`, use `visual_understanding` on the generated files under `previews/slides/`. These images are the authoritative visual evidence because they are the exact preview artifacts that will be published.
- Do not install Playwright or Chromium from the Agent. Template finalization uses the configured Super Magic Browser backend automatically.
- Use `generate_images` only for neutral, non-sensitive visual assets when the source does not provide enough usable imagery.
- Use `ask_user` for the Intake Checkpoint, later sensitive-asset confirms, intentional template updates, and an occupied user-provided target. Do not ask questions the user already answered.

For webpage visual QA, call the tools in `run_sdk_snippet` like this:

```python
run_sdk_snippet(python_code="""
from sdk.tool import tool

canvas_width = 1920  # Read source.canvas.width from template.json.
canvas_height = 1080  # Read source.canvas.height from template.json.
visual_result = tool.call("visual_understanding_webpage", {
    "target": "<semantic-template-name>/slides/cover.html",
    "query": "Review visual hierarchy, readability, composition, canvas usage, and image quality.",
    "viewport_width": canvas_width,
    "viewport_height": canvas_height,
    "device_scale_factor": 1
})
if not visual_result.ok:
    raise SystemExit(visual_result.content)
print(visual_result.content)

layout_result = tool.call("analysis_slide_webpage", {
    "target": "<semantic-template-name>/slides/cover.html",
    "max_width": canvas_width,
    "max_height": canvas_height
})
if not layout_result.ok:
    raise SystemExit(layout_result.content)
print(layout_result.content)
""")
```

After finalization, visually inspect the exact generated preview instead of recapturing the webpage:

```python
run_sdk_snippet(python_code="""
from sdk.tool import tool

result = tool.call("visual_understanding", {
    "images": ["<semantic-template-name>/previews/slides/slide-001.png"],
    "query": "Review hierarchy, readability, composition, canvas usage, image quality, and background interference."
})
if not result.ok:
    raise SystemExit(result.content)
print(result.content)
""")
```

## Completion Gate

Do not report completion until:

- `finalize_slide_template` returned `result.ok`.
- `template.json` validates against `references/template-json.schema.json`.
- `category_code` and every `tag_codes` value exist in the bundled taxonomy, and `tag_codes` is non-empty.
- When a source PPTX was supplied, every extracted source asset has a completed `reuse` or `discard` decision. Only selected assets that are actually referenced by final HTML/CSS may remain under `images/source-assets/`.
- Every indexed slide exists, loads `../theme.css`, and resolves local assets.
- Every indexed slide has exactly one `main.slide-container` root, and its `data-width`/`data-height` values match `template.json.source.canvas`.
- No legacy conversion residue or forbidden output file remains.
- `previews/` exists. Spot-check cover, dense-content, data/process, and closing pages against the source. If warnings list unreviewed source pages, inspect those previews first.
- The template has a coherent design system and meaningful layout diversity, not only structurally valid files.
