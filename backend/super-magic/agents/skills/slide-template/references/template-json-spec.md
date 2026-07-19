# Slide Template `template.json` Specification

`template.json` is the only metadata entry point in a template source directory. Use `template-json.schema.json` in the same directory for machine validation.

This specification covers only the current HTML slide template project format. Legacy single-file `preview.html`, `template-pages.*`, `source.css`, nested `packages/`, and `previews/` written into the source directory must not be produced for new templates.

## 1. File Location

```text
<template-dir>/
├── template.json
├── magic.project.js        # optional PPTX conversion draft helper only
├── visual-spec.md
├── theme.css
├── images/
└── slides/
    ├── cover.html
    └── ...
```

The template source directory contains reusable source files only. Do not place previews, screenshot caches, published images, or package artifacts in it.

A PPTX conversion draft may include `magic.project.js` for slide preview or editing. It is not template metadata, must not be listed in `template.json.files`, and must be excluded from the final ZIP.

Place the packaged ZIP beside the template directory:

```text
<template-id>-template.zip
```

Publishing and preview outputs may be written to a separate artifact directory:

```text
artifacts/<template-id>/
├── template.zip
├── home.png
├── thumbnail.png
├── collage.png
├── manifest.json
└── previews/
    └── slides/
        ├── cover.png
        └── ...
```

## 2. Top-Level Structure

```json
{
  "schema_version": "1.0",
  "template_id": "PPT-ink-classic",
  "label": {
    "zh_CN": "洇墨纸张风",
    "en_US": "Ink Classic"
  },
  "description": {
    "zh_CN": "适合学术报告、生态研究、政策分析、智库、科学传播和人文研究的纸张质感模板。",
    "en_US": "An ink-on-paper slide template for academic reports, ecological research, policy analysis, think tank briefs, science communication, and humanities research."
  },
  "files": {
    "theme_css": "theme.css",
    "slides_dir": "slides",
    "images_dir": "images",
    "package_zip": "../PPT-ink-classic-template.zip"
  },
  "slides": [
    {
      "file": "slides/cover.html",
      "title": "Forest Ecosystem Carbon Cycle",
      "layout": "cover",
      "description": "Opening cover with a full-bleed local visual, ink overlay, report title, subtitle, and author metadata."
    }
  ],
  "source": {
    "kind": "original",
    "file": "",
    "canvas": {
      "width": 1920,
      "height": 1080
    }
  },
  "warnings": []
}
```

Required fields:

- `schema_version`: fixed to the value 1.0.
- `template_id`: template ID matching `^PPT-[a-z0-9]+(?:-[a-z0-9]+)*$`.
- `label.zh_CN` and `label.en_US`: Chinese and English display names.
- `description.zh_CN` and `description.en_US`: Chinese and English template descriptions.
- `files`: template design specification, CSS, slide directory, and local asset directory.
- `slides`: reusable slide list and default playback order.
- `source`: source kind, source file, and canvas dimensions.
- `warnings`: non-fatal issues encountered during conversion or generation.

Optional fields:

- `category_code`: template category. It may be maintained by the platform or publishing workflow. If included, it must match `^PPT-CATE-[a-z0-9]+(?:-[a-z0-9]+)*$` and come from the platform category list.
- `files.visual_spec`: path to the template visual specification. A PPTX conversion draft may omit it initially. Before final publishing, generate `visual-spec.md` from an AI analysis of the converted slide style, then add the path.

Forbidden fields:

- `template_dir`: derive it from the template source directory path.
- `package_type`: derive it from the publishing workflow or `files.slides_dir`.
- `name`: use `label` for display names.
- `taxonomy`, `review_status`, and `copyright_notice`.
- `slides[].slots`, `slides[].source_slide`, `slides[].best_for`, and `slides[].risks`.

## 3. `files`

```json
{
  "theme_css": "theme.css",
  "slides_dir": "slides",
  "images_dir": "images",
  "package_zip": "../PPT-ink-classic-template.zip"
}
```

Constraints:

- `theme_css` is the shared visual system for the template.
- `slides_dir` contains reusable slide templates. Every slide must load `../theme.css`.
- `images_dir` contains local assets.
- `visual_spec` is optional. Before final publishing, it should point to `visual-spec.md` generated from an AI style analysis.
- `package_zip` is optional and only describes the recommended package output location.
- Do not list cover images, thumbnails, collages, or other preview images in `template.json.files`.
- Do not list `magic.project.js` in `template.json.files`. It is allowed only as a PPTX conversion draft helper and must be excluded from the final ZIP.

## 4. `slides`

```json
[
  {
    "file": "slides/cover.html",
    "title": "Forest Ecosystem Carbon Cycle",
    "layout": "cover",
    "description": "Opening cover with a full-bleed local visual, ink overlay, report title, subtitle, and author metadata."
  }
]
```

Constraints:

- `file` is a template-relative path in the form `slides/<layout>.html`.
- `title` is English and describes the default slide content.
- `layout` uses kebab-case, for example `agenda-segments` or `kpi-chart-dashboard`.
- `description` is English and explains the slide structure and components.
- The order of the `slides` array is the default playback order; do not depend on numeric filename sorting.
- Every slide file must use a distinct layout or component composition. Do not duplicate the same structure and change only the title.
- `slides` must reflect the slide files currently present in the template directory. After a user edits the draft, update `template.json.slides` when a slide is deleted, renamed, or moved, and remove references to files that no longer exist.
- Before packaging, publishing, or further editing, re-read the `slides/` directory and `template.json.slides` and use the user latest file state. Do not restore a user-deleted slide merely because old metadata still references it.

Slide HTML may keep a small number of `data-slot`, `data-slot-type`, and `data-slot-role` attributes as editing hints for the model. They are not part of the `template.json` metadata contract. When generating a new deck, decide replacements and rewrites from the actual HTML structure, styles, and content rather than relying on `template.json.slots`.

## 5. `source`

```json
{
  "kind": "converted",
  "file": "brand-template.pptx",
  "canvas": {
    "width": 1920,
    "height": 1080
  }
}
```

Constraints:

- `kind` must be `original`, `converted`, or `derived`.
- `file` records the source filename or an empty string.
- `canvas.width` is fixed to `1920`.
- `canvas.height` is fixed to `1080`.

## 6. Categories

Categories may be maintained outside the template by the platform or publishing workflow. If `category_code` is included, it must come from the platform category list. Current categories include:

- `PPT-CATE-business-report`
- `PPT-CATE-startup-pitch`
- `PPT-CATE-product-growth`
- `PPT-CATE-sales-marketing`
- `PPT-CATE-education-training`
- `PPT-CATE-academic-research`
- `PPT-CATE-technology-engineering`
- `PPT-CATE-government-organization`
- `PPT-CATE-healthcare`
- `PPT-CATE-culture-creative`

## 7. Slide and Asset Requirements

- Generate 9 independent slide files by default; expand only when needed.
- Every slide uses a fixed 1920x1080 canvas and loads `../theme.css`.
- Visible content defaults to English.
- Put slide-specific layout rules in the current slide style block. Keep only the template-level visual system in `theme.css`.
- Slides must use a native 1920x1080 layout. Do not keep `legacy-frame`, `legacy-stage`, `legacy-panel`, `composite-frame`, `preview-header`, `slides-grid`, or thumbnail enlargement structures such as `scale(3/5.3/6)`.
- Every slide needs a clear visual anchor, such as a chart, KPI, matrix, image area, color block, timeline, or template-specific decoration.
- Reference images only through local `../images/...` paths.
- When a slide needs illustrations, photos, avatars, logos, or scene images, store the required assets in local `images/` and reference them from HTML/CSS.
- Do not leave empty image areas, placeholder URLs, placeholder copy, or gray boxes used only as mockups.
- Do not use remote fonts, remote images, or unrelated scripts. Complex chart slides may load ECharts from a CDN only for chart rendering.
- During authoring, run a lightweight overflow check: `documentElement.scrollWidth/scrollHeight` must not exceed 1920x1080, key elements must stay inside the canvas, and text must not be visibly clipped.
