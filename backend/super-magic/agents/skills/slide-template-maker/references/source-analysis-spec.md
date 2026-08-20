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

## Background measurement

`prepare_slide_template_source` measures the dominant border color of every rendered page and groups the pages into background schemes. Its `content` states the background map, and `data` carries `page_backgrounds` per page plus `background_variants` per scheme:

```json
{
  "key": "dark:flat:1-2-3",
  "color": "#102a43",
  "tone": "dark",
  "uniform": true,
  "pages": [1, 7, 12]
}
```

`tone` is derived from WCAG relative luminance, so it tells you which text color the page needs. `uniform` is false when the border samples were not consistent, which means a gradient, split field, photo, or pattern rather than a flat fill.

These are measurements, not opinions. Prefer them over your own reading of the page, and reproduce every scheme in the finished template.

## Visual review

Call `review_slide_template_source` with `template_dir` and 1–3 `source_indexes`. The tool attaches official full-page images and representative crops, then writes `visual_analysis` itself. Use every index in `prepared.data["recommended_review_indexes"]`; that list already covers one page per background scheme, so a skipped entry means a scheme gets reconstructed from guesswork. Include mascot or brand-illustration pages when they exist.

Its `content` reports, per reviewed page: the measured background with the body text color, the palette roles, the composition geometry as percentages, the type scale as percentages of canvas height, and the `must_preserve` details. Read those values and carry them into `visual-spec.md`, `theme.css`, and the slide HTML. The model-reported `base_color` and `tone` are overwritten with the measured values, so the background reported here is always authoritative.

Finalization still requires completed `reuse`/`discard` decisions, referenced selected assets, and no leftover files in `images/source-assets/`. Unreviewed source pages and unreviewed background schemes become warnings, not a hard stop; a warning about an unreviewed scheme means that scheme is probably missing from the template, so resolve it before reporting completion.

## Asset review contract

Review each catalog item against the candidate image and its source-slide usage clues:

- `asset_type`: choose one of `illustration`, `photo`, `texture`, `icon`, `logo`, `screenshot`, `diagram`, or `other`.
- `quality`: use `high`, `acceptable`, or `poor`. Consider native dimensions, sharpness at intended display size, transparency, compression, and crop quality.
- `decision`: use `reuse` only when the asset has a clear role in the final template and will be referenced by HTML or CSS; otherwise use `discard`.
- `rationale`: state the visual value or the concrete discard reason. Do not use empty or generic reasons.
- Reused assets require a lowercase semantic `target_name` with the original extension and an `intended_role`. A `poor` asset cannot be reused.

The source PPT is evidence, not an asset inventory to copy blindly. If a source image is low quality, unrelated, sensitive, duplicated, or makes the reconstructed layout worse, discard it even when it appears on a source slide. If no candidate materially improves the template, discard all candidates and author the layout with safe local CSS or neutral assets.

Do not create `.template-work/` inside the template directory. Do not invent `source-analysis.json`.
