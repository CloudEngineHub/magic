# Custom Template Workflow

Use when the user describes a style in text, provides screenshots, or gives an existing PPT project.

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
- `slides/`: optional sample template pages. If sample pages are generated, each page must include `data-slot` attributes for replaceable content and be listed in `template.json.slides`.
- `images/`: local assets only.

## 4. Style Requirements

`theme.css` must implement a real visual system:

- Include `:root` variables for background, text, accent, border, chart colors, spacing, radius, and shadow.
- Include the fixed canvas reset: `html, body, .slide-container { width: 1920px; height: 1080px; overflow: hidden; }`.
- Define template-specific components and decorative classes. Avoid generic card-only styling.
- Keep structural page layout in individual slide HTML when pages exist; `theme.css` should provide reusable parts, not force every page into one layout.
- Every generated sample slide should have one clear visual anchor: image area, chart, KPI block, matrix, signature decoration, or dramatic typography.

## 5. `template.json`

Use `template.json` as the only metadata entrypoint:

- `schema_version`, `template_id`, and `name` identify the template.
- `files.package_zip` points to the sibling ZIP when one is created, for example `../<template-id>-template.zip`.
- Preview image paths belong in the publishing artifact manifest or publish state, not in the source template package.
- `slides` records the generated sample pages. Use an empty array if no sample pages are present.
- `source` records source kind, source file when available, and canvas size.
- `warnings` records non-fatal generation or conversion issues.

## 6. Using The Template

When creating a PPT from this template:

1. Read `template.json`.
2. Copy `theme.css` into the target PPT project.
3. Select from `template.json.slides` if sample pages exist; otherwise create pages using the theme rules.
4. Replace only content bound by `data-slot` when reusing sample pages.
5. Keep all generated assets inside the target project, usually under `images/`.
