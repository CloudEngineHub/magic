# Source Analysis Specification

`prepare_slide_template_source` creates an internal `source-analysis.json`. This is tool-owned authoring state, not a file the Agent should read, write, or recreate. `finalize_slide_template` removes it after success and keeps a summary in `template-assets.json`.

## Required catalog fields

Each extracted asset has a public id the Agent must use:

```json
{
  "id": "asset-01",
  "source_file": "source-analysis/source-assets/<hash>.png",
  "asset": "source-assets/<hash>.png",
  "decision": "pending"
}
```

Call `select_slide_template_source_assets` with `asset-01`, `asset-02`, and so on. Do not pass document-converter filenames such as `<source>_image_0001.webp`. Legacy `asset_catalog[].asset` paths still work, but public ids are the contract.

## Visual review

Call `review_slide_template_source` with `template_dir` and 1–3 `source_indexes`. The tool attaches official full-page images and representative crops, then writes `visual_analysis` itself. Prefer `prepared.data["recommended_review_indexes"]`. Include mascot or brand-illustration pages when they exist. You do not need every source page to be reviewed before authoring HTML.

Finalization still requires completed `reuse`/`discard` decisions, referenced selected assets, and no leftover files in `images/source-assets/`. Unreviewed source pages become warnings, not a hard stop.

## Asset review contract

Review each catalog item against the candidate image and its source-slide usage clues:

- `asset_type`: choose one of `illustration`, `photo`, `texture`, `icon`, `logo`, `screenshot`, `diagram`, or `other`.
- `quality`: use `high`, `acceptable`, or `poor`. Consider native dimensions, sharpness at intended display size, transparency, compression, and crop quality.
- `decision`: use `reuse` only when the asset has a clear role in the final template and will be referenced by HTML or CSS; otherwise use `discard`.
- `rationale`: state the visual value or the concrete discard reason. Do not use empty or generic reasons.
- Reused assets require a lowercase semantic `target_name` with the original extension and an `intended_role`. A `poor` asset cannot be reused.

The source PPT is evidence, not an asset inventory to copy blindly. If a source image is low quality, unrelated, sensitive, duplicated, or makes the reconstructed layout worse, discard it even when it appears on a source slide. If no candidate materially improves the template, discard all candidates and author the layout with safe local CSS or neutral assets.

Do not create `.template-work/` inside the template directory. Do not invent `source-analysis.json`.
