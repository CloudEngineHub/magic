# Custom Template Workflow

Use when the user describes a style in text, provides screenshots, or provides an existing template package.

If the user provides an existing Super Magic slide project directory that contains `magic.project.js` with `type: "slide"` and asks to convert or extract it into a reusable template, use `project-template-workflow.md` instead.

## 1. Inputs

- Existing template package: use `list_dir`, then read `template.json` if present, `visual-spec.md`, `theme.css`, and 2-3 representative slide HTML pages.
- Screenshot: use `visual_understanding` to extract palette, background, font hierarchy, container style, decorative elements, and style keywords.
- Text: infer the same design spec from the user's words.

## 2. Output Structure

Generate a standalone template package folder at the workspace root, not inside this skill:

```text
<template-dir>/
├── template.json
├── visual-spec.md
├── theme.css
├── images/
└── slides/
```

The folder should be a lightweight reusable template package. Do not create `magic.project.js`, `index.html`, `slide-bridge.js`, `preview.html`, `template-pages.md`, `template-pages.json`, `source.css`, or a nested `packages/` directory for the default output.

`previews/` may be generated only as a build or publishing artifact by a script that renders `slides/*.html`. Do not place `previews/` inside the template source folder, and do not include it in the template ZIP.

## 3. Required Files

- `visual-spec.md`: template design rules, including palette, typography, layouts, chart rules, image rules, slot policy, and avoid rules.
- `theme.css`: template-specific design system, including canvas reset, variables, typography, decorations, components, chart colors, and reusable visual helpers.
- `template.json`: follow `references/template-json-spec.md`; use `source.kind` to record the template source.
- `slides/`: independent reusable HTML pages. Default to 9 pages unless the user explicitly needs a smaller or larger template. Each page may include lightweight `data-slot` attributes for replaceable content and must be listed in `template.json.slides`.
- `images/`: local assets only.

## 4. Style Requirements

`theme.css` must implement a real visual system:

- Include `:root` variables for background, text, accent, border, chart colors, spacing, radius, and shadow.
- Include the fixed canvas reset: `html, body, .slide-container { width: 1920px; height: 1080px; overflow: hidden; }`.
- Define template-specific components and decorative classes. Avoid generic card-only styling.
- Keep structural page layout in individual slide HTML when pages exist; `theme.css` should provide reusable parts, not force every page into one layout.
- Every generated sample slide should have one clear visual anchor: image area, chart, KPI block, matrix, signature decoration, or dramatic typography.
- Each slide HTML must load `../theme.css`, use a native 1920x1080 layout, and avoid legacy scaled preview structures such as `preview.html`, `legacy-frame`, `slides-grid`, or `scale(...)`.
- Default visible content should be English.
- If a page needs illustrations, photos, avatars, logos, or scene visuals, save the assets under `images/` and reference local `../images/...` paths. Do not leave placeholder URLs, empty image boxes, or gray demo blocks.

## 5. `template.json`

Use `template.json` as the only metadata entrypoint:

- `schema_version` must be `"1.0"`.
- `template_id` must use the `PPT-xxxx` format.
- `category_code` is optional. If provided, it must use an existing `PPT-CATE-xxxx` category.
- `label.zh_CN`, `label.en_US`, `description.zh_CN`, and `description.en_US` are required.
- `files.package_zip` is optional and points to the sibling ZIP when one is created, for example `../<template-id>-template.zip`.
- Preview image paths belong in the publishing artifact manifest or publish state, not in the source template package.
- `slides` records generated page files with only `file`, `title`, `layout`, and `description`. Do not write `slides[].slots`.
- `source.kind` must be `original`, `converted`, or `derived`; custom templates normally use `original` or `derived`.
- `source.canvas` must be 1920x1080.
- `warnings` records non-fatal generation or conversion issues.

## 6. Using The Template

When creating a PPT from this template:

1. Read `template.json`.
2. Copy `theme.css` into the target PPT project.
3. Select from `template.json.slides` according to `layout`, `title`, and `description`.
4. Reuse `data-slot` hints from HTML when helpful, but do not expect slot metadata in `template.json`.
5. Keep all generated assets inside the target project, usually under `images/`.

## 7. Quality Checks

Before finishing:

- Validate `template.json` against `references/template-json.schema.json`.
- Confirm there is no `name`, `template_dir`, `package_type`, `taxonomy`, `review_status`, `copyright_notice`, or `slides[].slots`.
- Confirm every slide loads `../theme.css`.
- Confirm all image references resolve to local files.
- Run a lightweight overflow check for 1920x1080 pages and fix out-of-bounds content or obvious text clipping.
