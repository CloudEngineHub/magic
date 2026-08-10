# Source Analysis Specification

`prepare_slide_template_source` creates `.template-work/source-analysis/source-analysis.json`. This is an authoring manifest, not a final package file. It is removed after successful `finalize_slide_template`, while its summary is retained in `template-assets.json`.

## Required manifest fields

```json
{
  "schema_version": "1.0",
  "reconstruction_mode": "hybrid",
  "capture": {
    "contact_sheet": ".template-work/source-analysis/contact-sheet.png",
    "crop_grid": {"columns": 3, "rows": 3, "overlap_ratio": 0.1},
    "pptx_structure": ".template-work/source-analysis/pptx-structure.json",
    "source_assets_dir": ".template-work/source-analysis/source-assets"
  },
  "asset_catalog": [
    {
      "source_file": ".template-work/source-analysis/source-assets/<hash>.png",
      "asset": "source-assets/<hash>.png",
      "sha256": "...",
      "size_bytes": 12345,
      "source_slides": [1],
      "usage_count": 1,
      "metadata": {
        "width": 1200,
        "height": 800,
        "aspect_ratio": 1.5,
        "format": "PNG",
        "mode": "RGBA",
        "has_transparency": true,
        "quality_flags": []
      },
      "decision": "pending",
      "asset_type": "unknown",
      "quality": "unknown",
      "rationale": "",
      "intended_role": "",
      "target_name": null,
      "final_file": null
    }
  ],
  "slides": [
    {
      "source_index": 1,
      "full_image": ".template-work/source-analysis/full/slide-001.png",
      "detail_crops": [{"file": ".template-work/source-analysis/crops/slide-001/region-r01-c01.png"}],
      "visual_analysis": {
        "status": "complete",
        "summary": "Short description of the page's visual grammar.",
        "background": {},
        "palette": [],
        "typography": [],
        "composition": {},
        "visual_elements": [],
        "image_details": [],
        "style_tokens": {},
        "must_preserve": [],
        "uncertainties": []
      }
    }
  ],
  "warnings": []
}
```

## What to record

- `background`: background color, gradient, texture, image treatment, and edge behavior.
- `palette`: named roles such as canvas, ink, muted text, accent, data-positive, and data-warning. Include observed values when reliable.
- `typography`: title/body/label roles, family or fallback, approximate size, weight, tracking, line height, case, and wrapping behavior.
- `composition`: margins, anchor points, columns, alignment, rhythm, layering, whitespace, and reading order.
- `visual_elements`: each meaningful image, chart, table, diagram, motif, frame, badge, or decorative mark. Describe its role and geometry rather than only naming it.
- `image_details`: crop/focal point, subject placement, texture, overlay, blend, contrast, and whether the image is safe to reuse.
- `style_tokens`: reusable CSS-level decisions such as radii, border widths, shadows, grid gaps, icon treatment, chart strokes, and image filters.
- `must_preserve`: concrete details that would materially change the source style if lost. Include small but important details discovered in crops.
- `uncertainties`: facts that are not readable or cannot be safely inferred; do not silently invent them.

## Two-pass visual reading

1. Full page: identify the visual anchor, hierarchy, page purpose, background, large shapes, major image placement, and overall density.
2. Detail crops: inspect small type, text wrapping, line and border weight, texture, chart labels, image-internal details, icons, masks, and overlaps.

Keep each page's analysis bounded. Do not send the entire deck's full pages and all crops in one visual-understanding request.

`finalize_slide_template` requires at least four crops per page and rejects any page whose `status` is not `complete` or whose `must_preserve`, `visual_elements`, or `style_tokens` is empty.

## Asset review contract

Review each catalog item against the candidate image and its source-slide usage clues:

- `asset_type`: choose one of `illustration`, `photo`, `texture`, `icon`, `logo`, `screenshot`, `diagram`, or `other`.
- `quality`: use `high`, `acceptable`, or `poor`. Consider native dimensions, sharpness at intended display size, transparency, compression, and crop quality.
- `decision`: use `reuse` only when the asset has a clear role in the final template and will be referenced by HTML or CSS; otherwise use `discard`.
- `rationale`: state the visual value or the concrete discard reason. Do not use empty or generic reasons.
- Reused assets require a lowercase semantic `target_name` with the original extension and an `intended_role`. A `poor` asset cannot be reused.

The source PPT is evidence, not an asset inventory to copy blindly. If a source image is low quality, unrelated, sensitive, duplicated, or makes the reconstructed layout worse, discard it even when it appears on a source slide. If no candidate materially improves the template, discard all candidates and author the layout with safe local CSS or neutral assets.

When a source presentation is supplied, extracted embedded images remain temporary candidates under `.template-work/source-analysis/source-assets/` until visual review is complete. For every candidate, record `asset_type`, `quality`, `rationale`, and a `reuse` or `discard` decision through `select_slide_template_source_assets`. Reused assets also require `target_name` and `intended_role`; poor-quality assets cannot be reused. Finalization verifies that every selected asset exists, is referenced by final HTML/CSS, and is the only file present in `images/source-assets/`. Unused or discarded candidates are never part of the final package.
