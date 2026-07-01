# PPTX Template Workflow

Use this workflow when the user provides a `.pptx`, `.ppt`, `.potx`, `.pot`, `.ppsx`, WPS presentation, or a URL to a presentation file and asks to turn it into a platform slide template.

The final output is a reusable platform template folder plus a ZIP archive. For PPTX conversion, the folder format is the multi HTML page package:

- `multi_html_page_package`: `visual-spec.md`, `theme.css`, `source.css`, `pages/*.html`, `template-pages.md`, `template-pages.json`

`preview.html` is optional for PPTX-derived templates and must not be required by downstream PPT generation. The later PPT generation flow should copy `pages/*.html` for the selected layout and replace content through `data-slot` attributes. `theme.css` holds public reusable classes; `source.css` holds source-preserving PPTX extraction CSS used by `pages/*.html`.

After the final builder completes, it must write a ZIP archive under a sibling `packages/` directory next to the final template folder. Name it with the template style, such as `packages/<template-style>-template.zip`. The archive is a compact delivery package, not a mirror of the output directory. It must contain only `visual-spec.md`, `template-pages.md`, optional `template-pages.json`, `theme.css`, optional `source.css`, `pages/`, `assets/images/`, and `template-package.json`. It must not include intermediate extraction evidence, raw renderer files, `slides-html/`, `assets/slides.css`, `pptx-template-brief.*`, `source-*`, `cleaned-*`, `llm-*`, screenshots, PDFs, original PPTX files, or optional `preview.html`.

Do not output only a converted PPTX, PDF, screenshots, extracted HTML, or evidence bundle. Those files are intermediate evidence.

## 1. Prepare The Source

If the user gives a URL, download it first with `download_from_url` or `download_from_urls` into the workspace. If the user gives a local uploaded file path, keep the original source file unchanged.

Use one stable output directory per source file:

```text
.workspace/slide-template-output/<source-file-name-with-extension>/
```

For example, `brand-template.pptx` should use:

```text
.workspace/slide-template-output/brand-template_pptx/
```

## 2. Normalize 16:9 PPTX Canvas Before HTML Extraction

For 16:9 decks, create a resized PPTX copy before HTML extraction so `pptx-html-renderer` renders the source directly at the platform target canvas. Keep the user-provided source file unchanged.

```bash
python scripts/resize_pptx_canvas.py \
  --pptx /absolute/path/to/template.pptx \
  --output /absolute/path/to/output/normalized-1920x1080.pptx \
  --target-width-px 1920 \
  --target-height-px 1080
```

The resize script updates `ppt/presentation.xml` `p:sldSz` and scales slide/layout/master geometry, table dimensions, line widths, margins, and text sizes. It refuses non-matching aspect ratios by default; do not use `--allow-non-uniform` for template extraction unless the user explicitly accepts distortion. Non-16:9 decks should keep their source ratio and skip this normalization step.

Use the normalized PPTX path for the HTML extraction command below. In that case, `presentation.source_size_css`, `presentation.render_canvas`, and `presentation.target_canvas` should all be `1920 × 1080`, and `presentation.scale_to_target` should be `1`.

## 3. Render PPTX To HTML With `convert_pptx_to_html`

Use the `convert_pptx_to_html` tool as the standalone PPTX-to-HTML renderer. It calls `pptx-html-renderer` in the super-magic sandbox and writes `slides-html/slide-*.html`, static renderer assets, and `pptx-html-render.json`. The implementation is centralized under `app/tools/pptx_to_html/`.

Call it through Code Mode with `run_sdk_snippet` and `sdk.tool.call(...)`. Write the raw HTML package into the same stable output directory from step 1. If step 2 normalized the deck, pass the normalized PPTX path as `pptx_path`.

```python
from sdk.tool import tool

result = tool.call("convert_pptx_to_html", {
    "pptx_path": ".workspace/slide-template-output/brand-template_pptx/normalized-1920x1080.pptx",
    "output_dir": ".workspace/slide-template-output/brand-template_pptx",
    "override": True,
})

if not result.ok:
    raise RuntimeError(result.content)

manifest = result.data
```

Parameters:

- `pptx_path`: required. Workspace-relative or absolute path to the source or normalized PPTX.
- `output_dir`: optional. Must stay inside the workspace. Defaults to `.workspace/pptx-html/<file>_html` when empty; for this workflow, always set it to the step-1 output directory.
- `max_slides`: optional. Debug-only slide cap. Leave empty for full render.
- `override`: optional. Defaults to `true`. Set to `false` only when you must preserve an existing output directory.

For quick validation only:

```python
result = tool.call("convert_pptx_to_html", {
    "pptx_path": ".workspace/slide-template-output/brand-template_pptx/normalized-1920x1080.pptx",
    "output_dir": ".workspace/slide-template-output/brand-template_pptx",
    "max_slides": 3,
    "override": True,
})
```

After a successful call, read `result.content` for the render summary and `result.data` for the `pptx-html-render.json` payload (`presentation`, `html`, `assets`, `slides`, risks). This tool stops at the raw HTML evidence package; it does not generate cleaned slides, briefs, or the final platform template.

The compatibility extraction script still runs from this skill directory and calls the same converter before generating cleaned HTML, source bundles, and briefs:

```bash
node scripts/extract_pptx_template_from_html.mjs \
  --pptx /absolute/path/to/output/normalized-1920x1080.pptx \
  --output-dir /absolute/path/to/output
```

The script renders and analyzes all slides by default so that rare page types are not missed. `--max-slides` is only for debugging or quick validation. If `--max-slides` is used and fewer than all slides are rendered, the brief marks `html.is_complete=false` and must not be treated as complete template evidence.

Canvas contract: the extraction step preserves the PPTX CSS canvas derived from the input file's `ppt/presentation.xml` (`p:sldSz`, converted with `EMU / 9525`, matching `pptx-html-renderer`). If the 16:9 normalization step was used, the input file is the normalized copy and extraction should render `1920 × 1080` directly. If normalization is skipped, a 13.333 × 7.5 inch deck renders as `1280 × 720`, while a 10 × 5.625 inch deck renders as `960 × 540`. Do not force extraction to a legacy fixed canvas. The brief records `presentation.source_size_emu`, `presentation.source_size_css`, `presentation.render_canvas`, `presentation.target_canvas`, and `presentation.scale_to_target`.

Final template contract: the generated platform template remains fixed at `1920 × 1080` only when the source deck is 16:9. Prefer normalizing 16:9 PPTX files before extraction, which avoids a later HTML/CSS scaling pass. If normalization is skipped, `build_pptx_semantic_template.mjs` and `build_pptx_source_template.mjs` still scale source `px` geometry from `render_canvas` to `target_canvas` in `pages/*.html` and `source.css`/`theme.css`. Non-16:9 decks keep their source ratio and are not stretched.

The raw renderer writes:

- `slides-html/slide-*.html`: per-slide HTML evidence rendered by `pptx-html-renderer`.
- `assets/images/*`: media assets exported by `pptx-html-renderer`.
- `assets/slides.css`: shared renderer CSS exported by `pptx-html-renderer`.
- `pptx-html-render.json`: raw render manifest with source, presentation, HTML, asset, slide, and risk metadata.

The extraction script then writes:

- `cleaned-slides/slide-*.html`: per-slide standalone HTML evidence that preserves original style data while adding semantic classes.
- `assets/images/*`: migrated image resources plus large non-editable SVG externalized by the cleaner.
- `source-preview.html`: combined source page library that preserves every rendered slide's HTML structure.
- `source-theme.css`: extracted CSS rules converted from rendered inline styles.
- `cleaned-theme.css`: semantic CSS evidence shared by cleaned slide pages.
- `source-visual-spec.md`: source structure and style map for generating the final platform template.
- `pptx-template-brief.json`: structured data extracted from rendered HTML and PPTX canvas metadata.
- `pptx-template-brief.md`: model-readable summary for template generation.

SVG handling: use the deterministic tiered policy in `pptx_html_cleaner.mjs`. Preserve small SVG and editable-context SVG inline in the cleaned slide HTML and final evidence package. Apply conservative SVG minification by removing comments, whitespace-only text nodes, and redundant spacing in attributes. Externalize only large non-editable SVG to local `assets/images/slide-N-vector-M.svg` when a single SVG exceeds 20KB or the slide SVG total exceeds 100KB. Externalized SVG must be represented in the page by a same-position local `<img>` placeholder with `data-source-svg="externalized"`, `data-source-slide`, `data-svg-policy`, and `data-svg-policy-reason`, and must also be recorded under `assets.images` with `mime_type: "image/svg+xml"`. Do not leave `data:image/svg+xml`, `file:`, or remote SVG references in cleaned HTML or final page HTML. Inline SVG must keep a stable local coordinate system: when an SVG has no `viewBox`, the cleaner derives one from the surrounding `.shape-wrapper` source box or from the SVG width/height and sets `preserveAspectRatio="none"`. During final 16:9 target scaling, scale the outer layout box and the `<svg>` tag presentation attributes, but do not rewrite internal geometry for SVG that has `viewBox` (`path d`, `polygon points`, `rect x/y/width/height`, `ellipse cx/cy/rx/ry`, stroke widths, etc.). Do not rewrite path geometry during deterministic cleaning, because geometry changes can increase template drift.

Do not use a legacy Python PPTX parser as a fallback. If HTML rendering fails, use PDF/PNG only for visual understanding and report the extraction risk in the brief.

## 4. Load Document Converter For Visual Evidence

Load `document-converter` before reading or converting presentation files:

```text
read_skills(skill_names=["document-converter"])
```

Use `convert_document_format` to render the source presentation to PDF when visual evidence is needed. Convert all rendered source slides to PNG for visual understanding and quality checks. This visual path is not the structural extraction path. Do not default to representative-page sampling for PPTX-derived templates; if a slide was rendered and retained, it needs visual evidence or an explicit visual-evidence degradation note.

Use visual evidence to understand:

- background textures and gradients
- composition rhythm
- master page decorations
- visual density
- image treatment
- chart/table styling
- speaker/title/section/closing page patterns

## 5. Index All Page Types

Read `pptx-template-brief.json` and `pptx-template-brief.md` before generating files. The brief includes `page_patterns`; every item with `required_preview=true` must be represented in the page package and `template-pages.json`.

Common page types include:

- cover page
- contents page
- section page
- single-column content page
- multi-column content page
- card-list page
- metrics page
- chart page
- table page
- timeline page
- process page
- comparison page
- image page
- summary or closing page

If a page type appears only once in the source deck, still keep it as a `pages/*.html` template page. Do not discard it as an outlier unless the brief marks a rendering risk and visual evidence confirms it is not part of the template system.

## 6. Prepare Source Evidence For LLM Generation

Before generating final template files, read:

- `cleaned-slides/slide-*.html`
- `cleaned-theme.css`
- `source-preview.html`
- `source-theme.css`
- `source-visual-spec.md`
- `style_summary` in `pptx-template-brief.json`
- `cleaned_html` and `page_package_candidates` in `pptx-template-brief.json`

Use `cleaned-slides/` and `cleaned-theme.css` as the primary structural and semantic CSS evidence. Cleaned HTML should preserve original style data and add semantic class names; it should not aggressively remove inline style values from the source render. Use `source-preview.html` and `source-theme.css` as raw fallback evidence. `pptx-template-brief.json` is the index and summary, not the full source of truth for layout and styling.

The goal is LLM style/layout consolidation: preserve source HTML structure and style values as evidence, then generate a shorter, maintainable platform template with shared layout/component classes.

Before writing final files, do a per-slide visual/source audit. For each source slide, compare visual evidence such as PDF/PNG renderings with `slides-html/slide-*.html` and the matching section in `source-preview.html`. Then classify each visible structure or content block with the decision vocabulary `retain / parameterize / replace / drop`:

- `retain`: keep HTML structures that carry actual layout, grouping, chart/table shells, image masks, decorative geometry, or visual hierarchy.
- `parameterize`: turn reusable text, metric, list, table, chart, icon, and image content into template slots.
- `replace`: substitute source-specific business content with placeholders only after the underlying reusable structure has been retained.
- `drop`: remove duplicated wrappers, measurement artifacts, invisible helper nodes, or rendering noise only when visual evidence confirms they do not affect the page.

Produce an internal source-to-template mapping and placeholder plan before authoring `theme.css`, `source.css`, `pages/*.html`, `template-pages.md`, and `template-pages.json`. The mapping should connect source slide indexes, retained HTML structures, generated layout/component class names, placeholder fields, migrated assets, and inline style exceptions.

When model assistance is available, use the project-local `using-llm` Python SDK pattern to generate an optional LLM page plan:

```bash
python scripts/generate_pptx_llm_page_plan.py \
  --source-dir /absolute/path/to/extraction-output
```

This writes `llm-page-plan.json`. It should classify each source slide into a reusable `layout_kind`, choose stable page file names, and name replacement slots. `scripts/build_pptx_semantic_template.mjs` consumes this file when present. If the LLM call is unavailable or low confidence, skip it and use deterministic classification; do not block template generation.

Generate the final visual semantics with LLM visual understanding:

```bash
python scripts/generate_pptx_llm_visual_spec.py \
  --source-dir /absolute/path/to/extraction-output \
  --image-dir /absolute/path/to/all-slide-pngs \
  --max-images-per-request 3 \
  --max-request-image-bytes 1572864 \
  --image-max-width 1280
```

This writes `llm-visual-spec.md` and a lightweight `llm-visual-spec.json` page index. Use all PNG/PDF-rendered slide images when available so the model can preserve each source PPTX page's original design semantics instead of relying only on script statistics. Use the script's batch visual evidence path for all source screenshots; it enforces `--max-images-per-request`, `--max-request-image-bytes`, compresses LLM-only local image copies with `--image-max-width`, and splits `413 Request Entity Too Large` batches before recording a visual evidence degradation note. Do not call `visual_understanding` once with many pages, because the generic tool does not own the PPTX visual-evidence batching contract. The LLM output is the design-semantics source for `visual-spec.md` and the per-page selection guide in `template-pages.md`; it must not be treated as a replacement for the executable page package, and the final output must be not just a visual summary.

Before creating `pages/*.html`, preserve all original source slides by default. Do not simplify, merge, or omit pages only because their layouts look similar. Every rendered source slide should generate a corresponding HTML template page, even when multiple slides share the same `page_patterns[].id`. Only skip a page when extraction failed, visual evidence proves it is a non-page rendering artifact, or the user explicitly asks for manual pruning. The extraction brief records this source-preserving choice under `cleaned_html.page_retention`.

When creating the final platform files:

- Preserve source HTML structure where it defines real page layout, component grouping, chart/table shells, image masks, or decorative geometry.
- Use the source-to-template mapping to ensure retained structures, placeholder fields, generated classes, and `data-slot` attributes stay aligned across `visual-spec.md`, `template-pages.md`, `template-pages.json`, and `pages/*.html`.
- Generate final `theme.css` with public reusable tokens, layout classes, component classes, and visual helper classes.
- Generate final `source.css` with source-preserving PPTX extraction CSS that is still needed for high-fidelity converted pages.
- Generate final `pages/*.html` as independent reusable template pages. Each page must load `../theme.css` and `../source.css`, and must correspond to a layout in `template-pages.md` and `template-pages.json`.
- Generate `template-pages.md` as the primary model-readable page selection guide. It must record page file, layout type, source slide indexes, use case, visual role, visual anchor, suitable content, unsuitable content, slots, generation notes, risks, and asset dependencies.
- Generate `template-pages.json` only as a lightweight machine index and validation contract. It should record page file, layout type, source slide indexes, slots, asset dependencies, and optional short visual fields such as `visual_role`, `visual_anchor`, and `best_for`; do not put long visual descriptions in JSON.
- Mark replaceable text, image, metric, chart, and table content in `pages/*.html` with `data-slot` and `data-slot-type`. Later PPT generation should copy `pages/*.html` and replace those slot nodes, not regenerate layout from `preview.html`.
- `preview.html` is optional; if a lightweight index is generated, it must reference page files only. `pages/*.html` lives under `pages/` and must reference images as `../assets/images/...` and shared CSS as `../theme.css` plus `../source.css`.
- Preserve original style data in cleaned HTML and final page evidence as much as possible. Semantic class names should supplement source style values; do not remove most inline styles during deterministic cleaning.
- Use tiered SVG handling: keep small and editable-context SVG inline, minify SVG conservatively, and keep SVG geometry unchanged. Large non-editable SVG may be externalized to local `assets/images/slide-N-vector-M.svg` when it exceeds the cleaner thresholds. `template-pages.json` and `visual-spec.md` must record the externalized SVG source slide, file path, purpose, and replacement risk.
- Allow inline style only for complex absolute positioning or one-off geometry that cannot be safely generalized.
- Extracted CSS must merge duplicate canonical declarations and use semantic `.pptx-style-*` names such as `pptx-style-text-run-*`, `pptx-style-positioned-box-*`, or `pptx-style-svg-shape-*`, not pure numeric names.
- Use source inline style attributes as high-fidelity evidence, but do not treat them as the final authoring format.
- Do not replace source-specific slide content unless the user asks for generic sample content.
- Do not rebuild a visually similar page from scratch when the rendered HTML already contains the source structure.
- Ensure each page pattern in `page_patterns` maps to a generated page template.

When you need a deterministic finalizer instead of manually authoring every template file, use the semantic builder:

```bash
node scripts/build_pptx_semantic_template.mjs \
  --source-dir /absolute/path/to/extraction-output \
  --output-dir /absolute/path/to/template-output
```

This builder consumes `pptx-template-brief.json`, optional `llm-page-plan.json`, optional `llm-visual-spec.md`, optional `llm-visual-spec.json`, `cleaned-slides/`, `cleaned-theme.css`, `source-preview.html`, and migrated assets. It generates the page package with semantic page names, `data-slot` attributes, final `visual-spec.md`, model-readable `template-pages.md`, lightweight machine-readable `template-pages.json`, public `theme.css`, source-preserving `source.css`, and correct relative asset paths for `pages/*.html`. It also creates `../packages/<template-style>-template.zip` relative to the final template folder. The style name is derived from template style metadata when available and otherwise from the source PPTX file name.

The final `visual-spec.md` must be an executable template specification. It must include template identity, design semantics, color/font/spacing/border/shadow/image/SVG rules, a page coverage table, layout/component inventory, slot rules, CSS responsibilities, asset rules, risks, and instructions for generating a new PPT from `pages/*.html`.

`scripts/build_pptx_source_template.mjs` is only a debug/fallback tool. Use it when semantic finalization or LLM generation fails, or when a source-preserved scaffold is needed for inspection:

```bash
node scripts/build_pptx_source_template.mjs \
  --source-dir /absolute/path/to/extraction-output \
  --output-dir /absolute/path/to/template-output
```

This fallback script assembles both formats from the extraction output: `visual-spec.md`, `theme.css`, `preview.html`, `pages/*.html`, and `template-pages.md`. It prefers `cleaned-slides/` and `cleaned-theme.css`, falls back to source files, and copies migrated assets into the generated template folder. Do not treat its output as the default final template. Do not use `scripts/build_pptx_source_template.mjs` as the default finalizer. A compressed output such as only a few abstract pages plus a short `visual-spec.md` is incomplete for PPTX conversion.

In the default semantic finalization path:

- `theme.css` must include public layout/component classes such as `.layout-cover`, `.layout-section`, `.text-title`, `.shape-accent`, `.image-frame`, or equivalent names derived from the source.
- `source.css` must contain the source-preserving extraction CSS that is too specific for public reusable classes.
- `pages/*.html` must use the same public classes, load both `theme.css` and `source.css`, and expose replaceable content with `data-slot`.
- `template-pages.md` must record every template page, layout mapping, and per-page visual selection guidance. It is the main context for the model when creating new PPT pages from the converted template.
- `template-pages.json` must provide a lightweight machine-readable index for validation and future deterministic replacement tools. It is not the model's primary page-selection context.
- `visual-spec.md` should come from `llm-visual-spec.md` generated by LLM visual/structure understanding. It must not be a hard-coded script description of one sample template.

The extracted `.pptx-style-*` rules are supplementary CSS evidence. They must be deduplicated and semantically named, but the final `theme.css` should expose reusable layout/component classes rather than only `.pptx-style-*` evidence classes.

Iframe handling is the only default structural conversion. If `source-preview.html` contains readable iframe HTML, merge it into a single HTML file:

- `iframe[srcdoc]` body HTML must be inlined into the relevant `pages/*.html`.
- `iframe[src="data:text/html,..."]` body HTML must be inlined into the relevant `pages/*.html`.
- iframe `<style>` content must be appended to `source.css`.
- optional `preview.html` must not keep readable iframe wrappers or full source page markup.

## 7. Migrate Image Resources

The extraction script must migrate image resources into `assets/images/` and list them under `assets.images` in `pptx-template-brief.json`. When generating the platform template, copy required images from this migrated asset folder into the final template folder and reference them with local relative paths only.

External URLs or local file URLs found in the source must be listed under `assets.external_resources` and treated as risks. Do not leave `theme.css`, `source.css`, `pages/*.html`, or generated slide examples pointing to the original external source. If an external resource cannot be copied, either replace it with a local generated/selected asset or mark it explicitly in the final template notes.

## 8. Generate The Platform Template With LLM Consolidation

Do not use built-in templates as a styling benchmark for PPTX conversion. The source PPTX HTML/CSS and visual evidence are the benchmark.

Read one built-in template only as an output-format reference, not as visual style input. Examples:

- `<skill_dir>/assets/templates/monocle-editorial/visual-spec.md`
- `<skill_dir>/assets/templates/ink-classic/visual-spec.md`

Use the source bundle, `style_summary`, extracted assets, and visual evidence to generate a custom template folder in the user's workspace root. Do not write generated custom templates inside this skill's `assets/templates/` directory.

The generated files must stay aligned:

- Each layout type named in `visual-spec.md` must have a corresponding page in `pages/*.html`.
- Each template page listed in `template-pages.md` and `template-pages.json` must exist under `pages/*.html`.
- `template-pages.md` must include one per-page visual understanding and page-selection row for every retained source slide.
- `template-pages.json` only needs to align page files, layout types, source slide indexes, slots, asset dependencies, and short visual fields; it must not duplicate long model-facing guidance.
- Each core layout/component class defined in `theme.css` must be used by at least one page.
- `theme.css` and `source.css` must be loadable from every `pages/*.html`.
- Each `page_patterns[].id` with `required_preview=true` must map to a reusable page.
- Layout names in `visual-spec.md` must map to `page_patterns` and source slide indexes.
- All reused source images must come from the migrated local asset folder, not from embedded data URLs or source-only external links.

The generated `visual-spec.md` must be based on visual evidence and include:

- design concept inferred from the source visuals
- color, typography, spacing, radius, border, shadow, image, chart/table, and decorative rules
- layout/component inventory with matching CSS class names
- page coverage table with source slide indexes, page files, slot names, and core CSS classes
- instructions that tell the model to use `template-pages.md` as the primary page-selection guide
- slot rules with `data-slot` and `data-slot-type` usage
- CSS responsibilities for `theme.css`, `source.css`, and `pages/*.html`
- migrated asset rules and extraction risks

The generated `theme.css` must expose reusable tokens, layout classes, component classes, and visual helpers. Source-specific extracted rules belong in `source.css`. The generated `pages/*.html` files must load `theme.css` and `source.css`, and serve as independent reusable template pages for copy-and-replace generation.

## 9. Quality Gate

Before using or returning the template:

- Confirm final files exist: `visual-spec.md`, `theme.css`, `source.css`, `pages/*.html`, `template-pages.md`, and `template-pages.json`.
- Confirm page package files exist: `pages/*.html`, `template-pages.md`, `template-pages.json`, and `source.css`.
- If optional `preview.html` exists, confirm it does not link to files outside the generated template folder and does not duplicate full page HTML.
- Confirm `template-pages.md` records each page file, layout type, source slide indexes, slots, asset dependencies, and per-page visual selection guidance.
- Confirm `template-pages.json` records lightweight machine fields: page file, layout type, source slide indexes, slots, asset dependencies, and optional short visual fields.
- Confirm each `pages/*.html` file has `data-slot` attributes for replaceable content.
- Confirm reused PPTX image resources were copied into the generated template folder.
- Confirm every required page pattern from the brief appears in the page package.
- Confirm final `theme.css` includes reusable layout/component classes, not only `.pptx-style-*` evidence classes.
- Confirm final `source.css` contains source-preserving extraction CSS when the converted pages need it.
- Confirm every page pattern from `visual-spec.md` maps to a page in `pages/*.html`.
- Confirm `visual-spec.md` references visual evidence and source slide indexes.
- Preserve source-specific business content unless the user asks to replace it.
- If the brief has missing colors or fonts, rely on rendered HTML and visual evidence and state which values were inferred.

## 9. Validation With Downloaded PPTX Samples

When the user asks to validate with public PPTX templates, download samples under:

```text
.workspace/slide-template-validation/pptx-samples/
```

Write extraction results under:

```text
.workspace/slide-template-validation/results/<sample-name>/
```

Do not commit downloaded PPTX files or generated validation artifacts. They are runtime evidence only.
