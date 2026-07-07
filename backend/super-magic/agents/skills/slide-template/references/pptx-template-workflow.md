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

The conversion tool outputs a draft template source folder. Do not treat it as the final template, and do not stop after the tool returns. The agent must continue with the AI refinement workflow below: analyze the converted content, write `visual-spec.md`, refine `template.json`, `theme.css`, `images/`, and `slides/*.html`, run lightweight QA, then ask the user whether to package the refined folder into the final sibling ZIP.

If the conversion tool still emits legacy metadata in any environment, normalize the package to the current `references/template-json-spec.md` before handing it off: `schema_version` must be `"1.0"`, display text must use `label` and `description`, `source.kind` must be `converted`, and `slides` entries must contain only `file`, `title`, `layout`, and `description`. `category_code` is optional.

## 2. Output Structure

The conversion tool generates a lightweight draft template package structure:

```text
<output-root>/
├── <template-dir>/
│   ├── template.json
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

## 3. Mandatory AI Refinement After Tool Call

After `convert_pptx_to_slide_template` returns, continue working on the generated draft folder before ending the conversation:

1. Read the generated `template.json`, `theme.css`, and representative `slides/*.html`.
2. Inspect preview artifacts when available, especially cover and collage images under the artifact directory returned by the tool.
3. Analyze the converted deck's actual visual system: palette, typography hierarchy, spacing, layout patterns, decorative motifs, component types, chart/table treatment, image treatment, and repeated page structures.
4. Write `visual-spec.md` from that analysis. The file must describe the actual style of the converted PPT, not a generic conversion template.
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
   - Remove irrelevant debug attributes, dead markup, empty placeholders, broken references, and repeated boilerplate that hurts reuse.
   - Keep image and SVG references local to `../images/...`.
8. Run lightweight QA:
   - Validate `template.json` against `references/template-json.schema.json`.
   - Check that all referenced local assets exist.
   - Check that slides load `../theme.css`.
   - Check obvious overflow or clipping on risky pages when browser/DOM inspection is available.
   - Confirm the template source folder does not contain `preview.html`, `template-pages.*`, `source.css`, `previews/`, generated preview images, or a nested `packages/` directory.
9. End by reporting the refined draft folder and asking the user whether to package it as the final template ZIP.

Do not automatically create the ZIP unless the user confirms. If the user confirms packaging, add `files.package_zip` to `template.json`, then create `<template-id>-template.zip` beside the template folder. The ZIP must include only the refined template source files and must exclude artifacts, previews, debug output, original PPTX files, and intermediate render folders.

## 4. Template Metadata

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

## 5. Post-Conversion Refinement

Before creating the final ZIP:

1. Analyze the converted slide pages and preview artifacts with the model, then write `visual-spec.md` with the actual reusable visual system extracted from the deck.
2. Review `template.json` and confirm bilingual label, bilingual description, source canvas, warnings, and slide descriptions. Add `files.visual_spec` only after `visual-spec.md` exists. Add `category_code` only when classification should live in the template.
3. Review `theme.css`; keep template-level visual system there and avoid forcing every page into the same structure.
4. Review `slides/*.html`; remove irrelevant renderer artifacts, keep `../theme.css`, localize assets, and retain useful `data-slot` hints.
5. Run a lightweight overflow and asset-reference check.
6. Create the final sibling `<template-id>-template.zip` only after the refined source folder passes these checks.

## 6. How To Use The Template

When creating a new PPT from the generated template:

1. Read `<template-dir>/template.json`.
2. Choose a page from `template.json.slides` based on `layout`, `title`, and `description`.
3. Copy the selected `slides/*.html` into the target PPT project.
4. Copy `theme.css` and needed `images/` assets into the target PPT project.
5. Use `data-slot`, `data-slot-type`, and `data-slot-role` in HTML as editing hints when present; preserve the source structure, SVG, image containers, and style classes.

The template package does not need `magic.project.js`, `index.html`, or `slide-bridge.js`. Preview and publishing systems should use `template.json.slides`, `theme.css`, and `slides/*.html`; previews are generated afterward by script into artifact storage.

## 7. Debug Mode

By default, intermediate renderer artifacts are removed. Use `debug: True` only when diagnosing conversion problems. Debug artifacts are not part of the platform template package and must not be uploaded as the template ZIP.

## 8. Quality Checks

After the tool completes, verify:

- `<template-dir>/template.json` exists and has `slides`.
- The tool result marks the output as requiring refinement when `create_zip` is false.
- `<template-dir>/template.json` validates against `references/template-json.schema.json`.
- `template.json` uses `schema_version: "1.0"`, `PPT-...` template ID, and bilingual `label`/`description`. `category_code` may be omitted.
- `template.json.slides` contains only `file`, `title`, `layout`, and `description`.
- `template.json` does not contain legacy fields such as `name`, `slides[].slots`, `slides[].source_slide`, `slides[].best_for`, or `slides[].risks`.
- Before final packaging, `<template-dir>/visual-spec.md` exists, is generated from model analysis of the converted deck, and describes the reusable design system.
- `<template-dir>/slides/*.html` load `../theme.css` and reference local `../images/...` assets.
- The preview generation script writes the first-slide preview and matrix preview outside `<template-dir>/`, usually under `<artifact-root>/<template-id>/previews/`.
- Slide HTML contains `data-slot` attributes for replaceable text, images, or charts where available, but slot metadata is not duplicated into `template.json`.
- Default slide HTML does not contain renderer-only source attributes such as `data-element-id` or `data-source-shape-id`.
- Large decorative SVG paths are stored under `images/vectors/` by default instead of embedded inline.
- Before final release, `<output-root>/<template-id>-template.zip` exists beside the template folder.
- The ZIP does not include renderer debug output, original PPTX files, `template-pages.*`, `source.css`, `preview.html`, `previews/`, generated preview images, or a nested `packages/` directory.
