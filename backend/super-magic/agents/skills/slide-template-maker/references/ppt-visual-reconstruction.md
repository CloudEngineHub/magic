# Presentation Visual Reconstruction

Use this workflow for PPTX, PPT, POTX, POT, PPSX, WPS presentation files, and presentation-template URLs.

## 1. Prepare Visual Evidence

Never call `convert_pptx_to_slide_template`, `pptx-to-html`, or a repository-specific PPTX template converter.

Use `document-converter` through `run_sdk_snippet` after `create_slide_template_project`. Pass `created.data["converter_output_dir"]` as `output_dir` so PDF, page images, and extraction dumps stay outside the workspace. Do not create `document-converter-output/` in the workspace. Other document-converter tasks keep their normal workspace output.

1. Convert the presentation to PDF when necessary, writing into `converter_output_dir`.
2. Convert the PDF pages to PNG or JPEG files in the same `converter_output_dir`.
3. When reusable embedded images are needed, extract document content with image extraction enabled and inspect only the standalone candidates returned by the tool. Keep that extraction under `converter_output_dir`. Do not use converter HTML or renderer DOM.
4. Visual review of official page images is owned by `review_slide_template_source` after prepare.
5. Follow the document-converter large-document confirmation rule when the deck requires multiple visual batches.
6. Call `prepare_slide_template_source` with every rendered page image and the source OOXML file. Later tools only need `template_dir`. Keep reference material out of `images/`, `slides/`, and `previews/` until `select_slide_template_source_assets` copies approved files.
7. `prepare_slide_template_source` creates official full-page PNGs, overlapping crops, a contact sheet, optional PPTX structure, and public catalog ids such as `asset-01`.
8. Call `review_slide_template_source` with `recommended_review_indexes` (1–3 pages per call). Include cover, dense, data, closing, and mascot or brand-illustration pages. Then call `select_slide_template_source_assets` with those public ids until `pending_count` is `0`. Do not write `source-analysis.json` yourself and do not pass converter filenames.
9. If conversion, extraction, or visual reading fails, report the exact failing tool call and stop instead of inventing the deck's appearance. If `prepare_slide_template_source` fails, retry it. Do not emulate source analysis with converter-extracted filenames or a hand-written manifest.

Rendering is allowed only to inspect the source. Rendered page images must never become final slide pages.

## 2. Analyze The Whole Deck

Analyze representative pages through `review_slide_template_source`. First capture overall rhythm, then inspect cover, dense, data, and closing pages more closely. Do not replace this review tool with generic `visual_understanding` calls against converter filenames.

Record internally:

- Source page count, actual use case, audience, and narrative.
- Visual thesis, palette roles, typography hierarchy, spacing, shape language, and image treatment.
- Repeated layouts, low-value pages, page-density risks, and reusable component families.
- Safe reusable assets and sensitive or unclear assets.
- Candidate scene, template ID, and semantic page inventory.

Do not infer the template direction from the source filename alone. If the user already chose page-by-page restoration or reusable extraction, follow that intake. If shape is still missing, ask before `create_slide_template_project`; the recommended default is `hybrid` with 8-15 reusable layouts. Use `high-fidelity` only after the user chooses to keep source pages. High-fidelity still authors semantic HTML; converter HTML and full-slide screenshots are never finished pages.

## 3. Fuse The Narrative

For reusable/`hybrid` templates, create 8-15 reusable layouts based on the source's full narrative. For `high-fidelity`, keep the source page count minus advertisements, watermarks, download-site pages, contact pages, QR pages, copyright pages, and redundant alternates:

- Merge repeated covers and transitions into one cover and one section divider.
- Merge repeated text pages into concept, detail, quote, or case layouts.
- Merge related data pages into a dashboard and a focused analysis page.
- Merge repeated image pages into gallery, moodboard, or portfolio layouts.
- Merge sequential steps into a process, framework, timeline, or roadmap.
- Remove advertisements, watermarks, download-site pages, contact pages, QR pages, copyright pages, and redundant alternates.

For reusable/`hybrid` templates, do not copy every page, do not keep only the first ten pages, and do not add generic filler. For `high-fidelity`, keep useful source pages and still drop junk pages; do not paste converter HTML or full-slide screenshots.

## 4. Author A Clean Template

`create_slide_template_project` must already have created `<semantic-template-name>/` at the workspace root before conversion. Later tools only need `template_dir`. Do not use a converter draft as final source or add a `slide-templates/` prefix. After authoring, call `finalize_slide_template` so `previews/` and `template-assets.json` are generated beside the source files. Compare those previews with the source before reporting completion.

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

- Prefer high-quality source bitmaps, illustrations, photos, textures, icons, or motifs when they materially preserve the source visual identity. `prepare_slide_template_source` keeps them as temporary candidates; `select_slide_template_source_assets` copies only approved assets into `images/source-assets/` using public ids such as `asset-01`. Do not retain every source image, and do not force an asset into the template when it is blurry, redundant, irrelevant, sensitive, or harms the layout.
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
