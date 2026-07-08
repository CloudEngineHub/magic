# PPTX Template Workflow

Use this workflow when the user provides a `.pptx`, `.ppt`, `.potx`, `.pot`, `.ppsx`, WPS presentation, or a presentation-template URL and asks to convert it into a reusable platform template.

## 1. Use The Tool

Call the public tool `convert_pptx_to_slide_template`. Do not call the old raw HTML renderer tool, and do not run the old extraction/finalizer scripts from this skill.

```python
from sdk.tool import tool

result = tool.call("convert_pptx_to_slide_template", {
    "pptx_path": "<workspace-relative-or-absolute-pptx-path>",
    "output_dir": "",
    "override": True,
    "debug": False,
    "preserve_source_data_attrs": False,
    "externalize_inline_svg": True
})
```

The tool uses the static renderer bundle under Super Magic `static/tools/pptx-to-html/pptx-to-html.bundle.cjs`, then creates a compact template package.

By default, final `slides/*.html` removes renderer-only source attributes such as `data-element-id`, `data-source-shape-id`, and media trace fields. It keeps only semantic attributes needed for reuse: `data-role`, `data-slot`, `data-slot-type`, and `data-slot-role`. Set `preserve_source_data_attrs: True` only when debugging conversion or tracing an element back to the original PPTX.

Large non-slot inline SVG blocks are externalized by default into `images/vectors/*.svg`, then referenced from slide HTML as local `<img>` elements. This keeps slide HTML readable for AI editing while preserving visual output. Set `externalize_inline_svg: False` only when the SVG path itself needs to be edited.

The conversion tool outputs a draft template source folder. Do not treat it as the final template, and do not stop after the tool returns. The agent must continue with the AI refinement workflow below: analyze the converted content, write `visual-spec.md`, sanitize obvious sensitive content, confirm ambiguous sensitive assets through `ask_user`, refine `template.json`, `theme.css`, `images/`, and `slides/*.html`, run lightweight QA, then ask the user whether to package the refined folder into the final sibling ZIP.

If the conversion tool still emits legacy metadata in any environment, normalize the package to the current `references/template-json-spec.md` before handing it off: `schema_version` must be `"1.0"`, display text must use `label` and `description`, `source.kind` must be `converted`, and `slides` entries must contain only `file`, `title`, `layout`, and `description`. `category_code` is optional.

## 2. Output Structure

The conversion tool generates a lightweight draft template package structure:

```text
<output-root>/
├── <template-dir>/
│   ├── template.json
│   ├── magic.project.js
│   ├── theme.css
│   ├── images/
│   └── slides/
│       ├── slide-001.html
│       ├── slide-002.html
│       └── ...
└── artifacts/
    └── <template-id>/
        └── previews/
```

`magic.project.js` is allowed in the conversion draft only as a slide-preview/editing helper. It follows the slide project format with `window.magicProjectConfig = { version, type: "slide", name, slides }`, where `slides` points to the generated slide HTML files. It is not template metadata.

The final ZIP must be created only after post-conversion refinement. When created, the ZIP file must be a sibling of `<template-dir>/`. It must not be placed under `packages/` or inside the template directory.

Preview images may be generated, but only by a script that renders `slides/*.html` after the template package exists. Store generated previews in the build or publishing artifact directory, for example:

```text
<artifact-root>/<template-id>/previews/
├── thumbnail.png
├── collage.png
└── slides/
    ├── slide-001.png
    └── ...
```

Do not place `previews/` in `<template-dir>/`, and do not include `previews/` in the final `<template-id>-template.zip`.

## 3. Basic Sanitization

Run a lightweight sanitization pass after the conversion tool returns and before final packaging.

Always sanitize obvious sensitive text:

- Real names, phone numbers, email addresses, addresses, identity numbers, account IDs, tokens, API keys, passwords, secrets, and credentials.
- Contract numbers, order numbers, invoice numbers, customer names, supplier names, partner names, internal project names, private product codenames, and non-public roadmap items.
- Non-public financial data, exact business metrics, private performance data, operational KPIs, private URLs, intranet domains, file paths, QR code payloads, system identifiers, ticket IDs, database names, and environment names.
- Screenshot text that exposes internal systems, private dashboards, customer records, or proprietary workflows.

Replace sensitive text with neutral example content that preserves the layout and visual rhythm, for example `Customer Name`, `Project Alpha`, `Q3 Revenue`, `user@example.com`, `https://example.com`, `Sample Metric`, and `Business Unit`.

For ambiguous sensitive assets, ask before keeping them. When a logo, brand mark, internal system screenshot, product UI screenshot, customer case image, QR code, real person photo, proprietary icon, or business dashboard screenshot appears to be part of the template design, call `ask_user` before placing that asset in the final refined template.

The `ask_user` question must offer these choices:

- Replace with neutral asset (recommended): keep the layout and visual role, but use generic branding, neutral UI, placeholder QR style, or generated/non-sensitive visuals.
- Keep original asset: preserve the source asset in the draft and final package.
- Remove asset: delete it and redesign the area as a generic placeholder or non-image visual anchor.

Only keep the original asset if the user explicitly chooses to keep it. If the user does not answer, do not keep the original asset. List user-confirmed retained sensitive assets in the final report.

`visual-spec.md` must describe the reusable visual system only. Do not record the source PPT's private business facts.

## 4. Mandatory AI Refinement After Tool Call

After `convert_pptx_to_slide_template` returns, continue working on the generated draft folder before ending the conversation:

1. Read the generated `template.json`, `theme.css`, and representative `slides/*.html`.
2. Inspect preview artifacts when available, especially cover and collage images under the artifact directory returned by the tool.
3. Analyze the converted deck's actual visual system: palette, typography hierarchy, spacing, layout patterns, decorative motifs, component types, chart/table treatment, image treatment, and repeated page structures.
4. Write `visual-spec.md` from that analysis. The file must describe the actual style of the converted PPT, not a generic conversion template, and must not include private business facts from the source deck.
5. Update `template.json`:
   - Add `files.visual_spec: "visual-spec.md"` after `visual-spec.md` exists.
   - Keep `category_code` absent unless classification should live in the template.
   - Improve bilingual `label` and `description` if the source filename is not descriptive.
   - Improve each slide `title` and `description` based on the converted slide content and layout.
6. Refine `theme.css`:
   - Keep reusable visual system rules, variables, typography, colors, chart colors, and helpers.
   - Avoid putting page-specific layout rules into global selectors.
   - Remove obvious renderer noise only when it is not needed for visual fidelity.
7. Refine `slides/*.html`:
   - Keep fixed 1920x1080 pages and `../theme.css`.
   - Preserve the converted visual identity and source-specific layout intent.
   - Keep useful `data-slot`, `data-slot-type`, and `data-slot-role` hints.
   - Replace obvious sensitive text with neutral example content.
   - Remove irrelevant debug attributes, dead markup, empty placeholders, broken references, and repeated boilerplate that hurts reuse.
   - Keep image and SVG references local to `../images/...`.
   - Remove or replace ambiguous sensitive image assets unless the user confirmed keeping them through `ask_user`.
   - Keep `magic.project.js` only as a draft preview helper when useful; update its `slides` list if slide files are renamed or removed.
8. Run lightweight QA:
   - Validate `template.json` against `references/template-json.schema.json`.
   - Check that all referenced local assets exist.
   - Check that slides load `../theme.css`.
   - Check that slide HTML, CSS, metadata, and visual spec do not contain obvious sensitive text.
   - Check that `images/` contains no unconfirmed logos, internal screenshots, QR codes, real people, customer case images, private dashboards, or proprietary visuals.
   - Check obvious overflow or clipping on risky pages when browser/DOM inspection is available.
   - Confirm the template source folder does not contain `preview.html`, `template-pages.*`, `source.css`, `previews/`, generated preview images, or a nested `packages/` directory. `magic.project.js` may exist in the draft source folder.
9. End by reporting the refined draft folder, sanitization strategy, user-confirmed retained sensitive assets if any, and asking the user whether to package it as the final template ZIP.

Do not automatically create the ZIP unless the user confirms. If the user confirms packaging, add `files.package_zip` to `template.json`, then create `<template-id>-template.zip` beside the template folder. The ZIP must include only the refined template source files and must exclude `magic.project.js`, artifacts, previews, debug output, original PPTX files, intermediate render folders, and unconfirmed sensitive assets.

## 5. Template Metadata

`template.json` is the only metadata entrypoint. It must follow `references/template-json-spec.md` and include:

- `schema_version`: fixed to `"1.0"`.
- `template_id`: `PPT-xxxx` format.
- `category_code`: optional existing `PPT-CATE-xxxx` category. It may be omitted when classification is maintained outside the template.
- `label.zh_CN`, `label.en_US`, `description.zh_CN`, and `description.en_US`.
- `files`: `theme_css`, `slides_dir`, `images_dir`, optional `visual_spec`, and optional sibling `package_zip`. `visual_spec` may be absent in the draft and added after model-generated `visual-spec.md`; `package_zip` may be absent in the draft and added after final packaging.
- `slides`: page index with only `file`, `title`, `layout`, and `description`.
- `source`: `kind` set to `converted`, source PPTX filename, and a 1920x1080 canvas.
- `warnings`: non-fatal conversion or preview generation issues.

Do not write `name`, `template_dir`, `package_type`, `taxonomy`, `review_status`, `copyright_notice`, `slides[].source_slide`, `slides[].slots`, `slides[].best_for`, or `slides[].risks`.

Do not generate `template-pages.md` or `template-pages.json`; page selection data belongs in `template.json.slides`.

## 6. Post-Conversion Refinement

Before creating the final ZIP:

1. Analyze the converted slide pages and preview artifacts with the model, then write `visual-spec.md` with the actual reusable visual system extracted from the deck.
2. Review `template.json` and confirm bilingual label, bilingual description, source canvas, warnings, and slide descriptions. Add `files.visual_spec` only after `visual-spec.md` exists. Add `category_code` only when classification should live in the template.
3. Review `theme.css`; keep template-level visual system there and avoid forcing every page into the same structure.
4. Review `slides/*.html`; remove irrelevant renderer artifacts, keep `../theme.css`, localize assets, retain useful `data-slot` hints, and replace obvious sensitive text with neutral example content.
5. Review `images/`; remove or replace unconfirmed sensitive assets, and keep original ambiguous assets only when the user explicitly confirmed through `ask_user`.
6. Run a lightweight overflow, sensitive-content, and asset-reference check.
7. Create the final sibling `<template-id>-template.zip` only after the refined source folder passes these checks. Exclude `magic.project.js` and unconfirmed sensitive assets from the ZIP even when they remain in the draft folder.

## 7. Draft Synchronization After User Edits

After the draft template folder exists, the user's latest file edits are authoritative.

Before continuing refinement, QA, packaging, or reporting final status:

1. Re-read `template.json` and the current `slides/` directory.
2. Remove every `template.json.slides[]` entry whose `file` no longer exists.
3. If a slide file was renamed or moved and the user's intent is clear from the current file path, update the matching `template.json.slides[].file`; otherwise remove the stale entry instead of recreating the old file.
4. Preserve the order of remaining `template.json.slides` entries, unless the user explicitly reordered files or metadata.
5. Add a new `template.json.slides[]` entry for a new slide file only when the file is a valid reusable template page and the layout/title/description can be inferred safely.
6. Re-check image and SVG references after synchronization; remove unused assets only when they are not referenced by any remaining slide or stylesheet.
7. If `magic.project.js` remains as a draft preview helper, update its `slides` list to match the current slide files, or remove it from the draft if it is stale and no longer useful.

Do not restore a page just because `template.json` still references it. For example, if the user deleted `slides/market-overview.html` but `template.json.slides` still contains that file, remove that slide entry before QA or packaging.

## 8. How To Use The Template

When creating a new PPT from the generated template:

1. Read `<template-dir>/template.json`.
2. Choose a page from `template.json.slides` based on `layout`, `title`, and `description`.
3. Copy the selected `slides/*.html` into the target PPT project.
4. Copy `theme.css` and needed `images/` assets into the target PPT project.
5. Use `data-slot`, `data-slot-type`, and `data-slot-role` in HTML as editing hints when present; preserve the source structure, SVG, image containers, and style classes.

The conversion draft may keep `magic.project.js` for slide preview/editing. The final template ZIP must not include `magic.project.js`, `index.html`, or `slide-bridge.js`. Preview and publishing systems should use `template.json.slides`, `theme.css`, and `slides/*.html`; previews are generated afterward by script into artifact storage.

## 9. Debug Mode

By default, intermediate renderer artifacts are removed. Use `debug: True` only when diagnosing conversion problems. Debug artifacts are not part of the platform template package and must not be uploaded as the template ZIP.

## 10. Quality Checks

After the tool completes, verify:

- `<template-dir>/template.json` exists and has `slides`.
- The tool result marks the output as requiring refinement when `create_zip` is false.
- `<template-dir>/template.json` validates against `references/template-json.schema.json`.
- `template.json` uses `schema_version: "1.0"`, `PPT-...` template ID, and bilingual `label`/`description`. `category_code` may be omitted.
- `template.json.slides` contains only `file`, `title`, `layout`, and `description`.
- `template.json.slides` matches the current `slides/` files after user edits; stale references to deleted, renamed, or moved files are removed or corrected before packaging.
- `template.json` does not contain legacy fields such as `name`, `slides[].slots`, `slides[].source_slide`, `slides[].best_for`, or `slides[].risks`.
- Before final packaging, `<template-dir>/visual-spec.md` exists, is generated from model analysis of the converted deck, and describes the reusable design system.
- Before final packaging, slide HTML, CSS, metadata, and `visual-spec.md` do not contain obvious sensitive text.
- Before final packaging, `images/` contains no unconfirmed logos, internal screenshots, QR codes, real people, customer case images, private dashboards, or proprietary visuals.
- User-confirmed retained sensitive assets are listed in the final report before packaging.
- `<template-dir>/slides/*.html` load `../theme.css` and reference local `../images/...` assets.
- The preview generation script writes the first-slide preview and matrix preview outside `<template-dir>/`, usually under `<artifact-root>/<template-id>/previews/`.
- Slide HTML contains `data-slot` attributes for replaceable text, images, or charts where available, but slot metadata is not duplicated into `template.json`.
- Default slide HTML does not contain renderer-only source attributes such as `data-element-id` or `data-source-shape-id`.
- Large decorative SVG paths are stored under `images/vectors/` by default instead of embedded inline.
- Before final release, `<output-root>/<template-id>-template.zip` exists beside the template folder.
- The ZIP does not include `magic.project.js`, renderer debug output, original PPTX files, `template-pages.*`, `source.css`, `preview.html`, `previews/`, generated preview images, unconfirmed sensitive assets, or a nested `packages/` directory.
