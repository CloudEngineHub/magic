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

The tool uses the static renderer bundle under Super Magic `static/tools/pptx-to-html/pptx-to-html.bundle.cjs`, then creates a compact template project.

By default, final `slides/*.html` removes renderer-only source attributes such as `data-element-id`, `data-source-shape-id`, and media trace fields. It keeps only semantic attributes needed for reuse: `data-role`, `data-slot`, `data-slot-type`, and `data-slot-role`. Set `preserve_source_data_attrs: True` only when debugging conversion or tracing an element back to the original PPTX.

Large non-slot inline SVG blocks are externalized by default into `images/vectors/*.svg`, then referenced from slide HTML as local `<img>` elements. This keeps slide HTML readable for AI editing while preserving visual output. Set `externalize_inline_svg: False` only when the SVG path itself needs to be edited.

## 2. Output Structure

The generated package uses a slide-project-like structure:

```text
<output-root>/
├── <template-dir>/
│   ├── template.json
│   ├── magic.project.js
│   ├── index.html
│   ├── theme.css
│   ├── slide-bridge.js
│   ├── images/
│   ├── previews/
│   │   ├── cover.png
│   │   └── collage.png
│   └── slides/
│       ├── slide-001.html
│       ├── slide-002.html
│       └── ...
└── <template-id>-template.zip
```

The ZIP file must be a sibling of `<template-dir>/`. It must not be placed under `packages/` or inside the template directory.

## 3. Template Metadata

`template.json` is the only metadata entrypoint. It must follow `references/template-json-spec.md` and include:

- `schema_version`, `template_id`, and `name`.
- `files`: `entry_html`, `project_config`, `theme_css`, `slides_dir`, `images_dir`, the sibling `package_zip`, plus optional `thumbnail_image` and `collage_image` when preview generation succeeds.
- `slides`: page index with file, title, layout, source slide number, slots, suitable use, and risks.
- `source`: source kind, source PPTX filename, and source canvas.
- `warnings`: non-fatal conversion or preview generation issues.

Do not generate `template-pages.md` or `template-pages.json`; page selection data belongs in `template.json.slides`.

## 4. How To Use The Template

When creating a new PPT from the generated template:

1. Read `<template-dir>/template.json`.
2. Choose a page from `template.json.slides` based on layout, title, `best_for`, and slot structure.
3. Copy the selected `slides/*.html` into the target PPT project.
4. Copy `theme.css` and needed `images/` assets into the target PPT project.
5. Replace only content bound by `data-slot`, `data-slot-type`, and `data-slot-role`; preserve the source structure, SVG, image containers, and style classes.

`index.html` and `magic.project.js` are preview/project-shell files. They let the generated template directory open like a normal PPT project.

## 5. Debug Mode

By default, intermediate renderer artifacts are removed. Use `debug: True` only when diagnosing conversion problems. Debug artifacts are not part of the platform template package and must not be uploaded as the template ZIP.

## 6. Quality Checks

After the tool completes, verify:

- `<template-dir>/template.json` exists and has `slides`.
- `<template-dir>/magic.project.js` lists every generated slide file.
- `<template-dir>/index.html` can load the project shell.
- `<template-dir>/slides/*.html` load `../theme.css` and reference local `../images/...` assets.
- `<template-dir>/previews/cover.png` is the first-slide preview image when preview generation succeeds.
- `<template-dir>/previews/collage.png` is a matrix preview containing up to the first 9 slides when preview generation succeeds.
- Slide HTML contains `data-slot` attributes for replaceable text, images, or charts where available.
- Default slide HTML does not contain renderer-only source attributes such as `data-element-id` or `data-source-shape-id`.
- Large decorative SVG paths are stored under `images/vectors/` by default instead of embedded inline.
- `<output-root>/<template-id>-template.zip` exists beside the template folder.
- The ZIP does not include renderer debug output, original PPTX files, `template-pages.*`, `source.css`, `preview.html`, or a nested `packages/` directory.
