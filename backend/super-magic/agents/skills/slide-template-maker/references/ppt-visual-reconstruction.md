# Presentation Visual Reconstruction

Use this workflow for PPTX, PPT, POTX, POT, PPSX, WPS presentation files, and presentation-template URLs.

## 1. Prepare Visual Evidence

Never call `convert_pptx_to_slide_template`, `pptx-to-html`, or a repository-specific PPTX template converter.

Use `document-converter` through `run_sdk_snippet`:

1. Convert the presentation to PDF when necessary.
2. Convert the PDF pages to PNG or JPEG files in the temporary artifact directory returned by `document-converter`, and record that directory for later cleanup.
3. When reusable embedded images are needed, extract document content with image extraction enabled and inspect only the standalone candidates returned by the tool. Record every extraction directory. Do not use converter HTML or renderer DOM.
4. Use the document-converter image-reading workflow, including `understand_document_images`, to inspect page images in bounded batches.
5. Follow the document-converter large-document confirmation rule when the deck requires multiple visual batches.
6. After calling `create_slide_template_project`, move or copy the references still needed into its returned `working_directory`. Delete external temporary artifact directories as soon as they are no longer needed. Keep reference material out of `images/`, `slides/`, and `previews/`; only approved final assets are copied into `images/`.
7. After `create_slide_template_project`, call `prepare_slide_template_source` with every rendered page image and the source OOXML file. This creates:
   - one lossless full-page PNG per source page;
   - a 2–4 by 2–4 overlapping crop grid for local detail inspection;
   - a contact sheet for deck-level rhythm;
   - `pptx-structure.json` with text, fonts, shapes, fills, lines, image crops, and layer order when an OOXML source is supplied;
   - deduplicated embedded image candidates under `.template-work/source-analysis/source-assets/`;
   - an `asset_catalog` recording source paths, hashes, dimensions, usage clues, and pending review fields;
   - `asset_analysis_batches`, which groups candidate images for visual inspection.
8. Analyze every page twice: full-page first, then its crops. Review every candidate image in `asset_analysis_batches`, classify its type and quality, and call `select_slide_template_source_assets` with a complete `reuse` or `discard` decision for every candidate. Do not submit a page with `visual_analysis.status: pending` or an asset with a pending decision.
9. If conversion, extraction, or visual reading fails, report the exact failing tool call and stop instead of inventing the deck's appearance.

Rendering is allowed only to inspect the source. Rendered page images must never become final slide pages.

## 2. Analyze The Whole Deck

Analyze page images in bounded batches through `document-converter`. First analyze overall rhythm, then inspect representative pages at higher attention. Do not replace this document workflow with generic `visual_understanding` calls against the source presentation.

Record internally:

- Source page count, actual use case, audience, and narrative.
- Visual thesis, palette roles, typography hierarchy, spacing, shape language, and image treatment.
- Repeated layouts, low-value pages, page-density risks, and reusable component families.
- Safe reusable assets and sensitive or unclear assets.
- Candidate scene, template ID, and semantic page inventory.

Do not infer the template direction from the source filename alone. The default reconstruction mode is `hybrid`; choose `high-fidelity` for close reproduction and `template-abstraction` for a stronger reusable system.

## 3. Fuse The Narrative

Create 8-15 reusable layouts based on the source's full narrative:

- Merge repeated covers and transitions into one cover and one section divider.
- Merge repeated text pages into concept, detail, quote, or case layouts.
- Merge related data pages into a dashboard and a focused analysis page.
- Merge repeated image pages into gallery, moodboard, or portfolio layouts.
- Merge sequential steps into a process, framework, timeline, or roadmap.
- Remove advertisements, watermarks, download-site pages, contact pages, QR pages, copyright pages, and redundant alternates.

Do not copy every page. Do not keep only the first ten pages. Do not add generic filler.

## 4. Author A Clean Template

Plan the page inventory, then call `create_slide_template_project` to create a fresh `<template-id>/` directory at the workspace root. Move the references still needed into its returned `working_directory`; keep a list of any external temporary paths until they are deleted. Do not use a converter draft as final source or add a `slide-templates/` prefix. After authoring, call `finalize_slide_template` so `previews/` and `template-assets.json` are generated beside the source files and the temporary working directory is removed. Delete and verify any remaining tracked external temporary paths before reporting completion.

Author the files in this order:

1. `visual-spec.md`: the reusable design system, not a source summary.
2. `theme.css`: variables, typography, backgrounds, components, chart palette, and visual helpers.
3. `images/`: preserve safe original assets from `images/source-assets/` first; add semantic aliases or other local assets only when needed.
4. `slides/*.html`: new semantic HTML and page-specific CSS.
5. `template.json`: final metadata and semantic slide order.

For presentation-derived templates, write the source canvas detected from the presentation. For example:

```json
"source": {
  "kind": "derived",
  "method": "visual-reconstruction",
  "file": "source-deck.pptx",
  "canvas": { "width": 1920, "height": 1080 }
}
```

Keep `source.file` to the source basename. Never expose an absolute workspace path.

Do not replace a square or other source canvas with `1920x1080`; the dimensions may be normalized for authoring, but the aspect ratio must remain unchanged.

## 5. Asset Handling

- Prefer high-quality source bitmaps, illustrations, photos, textures, icons, or motifs when they materially preserve the source visual identity. `prepare_slide_template_source` keeps them as temporary candidates; `select_slide_template_source_assets` copies only approved assets into `images/source-assets/`. Do not retain every source image, and do not force an asset into the template when it is blurry, redundant, irrelevant, sensitive, or harms the layout.
- Preserve the extracted asset's original crop, focal point, transparency, aspect ratio, masking, and overlay treatment. A generated replacement is allowed only when the source asset is unavailable, unreadable, or explicitly rejected as sensitive.
- Deduplicate repeated assets by content identity.
- Normalize retained bitmap assets to WebP when practical and name them by role.
- Use CSS or SVG for charts, diagrams, icons, and small motifs.
- Do not keep full-slide screenshots, source-specific dashboards, real customer data, personal photos, QR codes, or proprietary UI without explicit confirmation.
- When the visual system requires imagery but the source cannot be reused safely, create neutral replacement assets instead of empty boxes.
- Every selected source asset must have a semantic target filename, an intended role, and an actual reference from final HTML or CSS. The final package must contain no unselected or unused source asset.

## 6. Reconstruction Gate

The result fails visual reconstruction if any of these remain:

- `slide-001.html`, `Converted Slide`, renderer class names, or source-tracing attributes.
- Full-slide screenshots used as page backgrounds to imitate the source.
- Absolute-positioned fragments copied from converter output without semantic reconstruction.
- Source filename, provider branding, download-site text, private metrics, or conversion notes in visible content.
- `source.kind: "converted"` or a converter method in newly generated metadata.

Run the shared quality checks in `quality-guidelines.md` before reporting completion.
