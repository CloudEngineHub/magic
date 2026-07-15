# Project Template Workflow

Use this workflow when the user provides an existing Super Magic slide project directory and asks to convert or extract it into a reusable platform template.

This workflow is for an HTML slide project directory, not for `.pptx`, `.ppt`, `.potx`, `.pot`, `.ppsx`, or WPS presentation files. Presentation files must use `pptx-template-workflow.md`.

## 1. Identify The Source Project

Before creating any template files:

1. Locate the source directory and read `magic.project.js`.
2. Confirm `window.magicProjectConfig.type` is `"slide"`.
3. Read `window.magicProjectConfig.slides` and treat that array as the source page order.
4. Check that every referenced slide HTML file exists.
5. Inspect `images/` and other local asset folders referenced by slide HTML or CSS.
6. Do not modify the source project.

If `magic.project.js` is missing, cannot be parsed, has a non-slide type, or the slide files are unavailable, stop and ask the user for the correct Super Magic slide project directory.

## 2. Analyze Layouts And Reuse

Analyze all source slides before selecting template pages:

- Identify layout families by structure, component combination, visual hierarchy, and intended use, not by title or body copy.
- Group repeated pages that share the same layout with only content differences.
- Keep the clearest and most reusable representative from each layout family.
- Do not include every source page when many pages repeat the same structure.
- Prefer a compact template inventory that covers the deck's real reusable patterns: cover, agenda, section divider, KPI, dashboard, comparison, timeline, process, quote, image story, chart, table, conclusion, and appendix when present.
- Record skipped repeated pages internally so the final report can state how many source pages were reduced into how many reusable layouts.

The generated template slides must be reusable layout pages, not a cleaned copy of the full source deck.

## 3. Create A New Draft Template Folder

Create a standalone draft template folder at the workspace root or another user-visible workspace location:

```text
<source-name>-template/
├── template.json
├── visual-spec.md
├── theme.css
├── images/
└── slides/
```

Do not create the draft folder inside this skill directory. Do not put it inside the source PPT project.

The draft source folder must not contain:

- `magic.project.js`
- `index.html`
- `slide-bridge.js`
- `preview.html`
- `template-pages.md`
- `template-pages.json`
- `source.css`
- `previews/`
- generated preview images
- original presentation files
- renderer debug output
- a nested `packages/` directory

## 4. Sanitize Sensitive Data

Use a conservative sanitization policy. Remove or neutralize source-specific content unless the user explicitly confirms it should be preserved.

Always sanitize these text categories:

- Real names, phone numbers, email addresses, home or office addresses, identity numbers, account IDs, tokens, API keys, passwords, secrets, and credentials.
- Contract numbers, order numbers, invoice numbers, customer names, supplier names, partner names, internal project names, private product codenames, and unpublished roadmap items.
- Non-public financial data, exact business metrics, private performance data, and operational KPIs.
- Private URLs, intranet domains, file paths, QR code payloads, system identifiers, ticket IDs, database names, and environment names.
- Screenshot text that exposes internal systems, private dashboards, customer records, or proprietary workflows.

Replace real content with neutral example content that preserves the page structure and visual rhythm, for example:

- `Customer Name`
- `Project Alpha`
- `Q3 Revenue`
- `user@example.com`
- `https://example.com`
- `Sample Metric`
- `Business Unit`

`visual-spec.md` must describe only the reusable visual system: palette, typography, spacing, layout patterns, components, chart style, image treatment, and avoid rules. It must not record the source project's real business facts.

## 5. Confirm Ambiguous Sensitive Assets With The User

Some assets may be both sensitive and part of the template identity. Do not decide alone whether to keep them.

When a logo, brand mark, internal system screenshot, product UI screenshot, customer case image, QR code, real person photo, proprietary icon, or business dashboard screenshot appears to be part of the template design, call `ask_user` before placing that asset in the draft template.

The `ask_user` question must offer these choices:

- Replace with neutral asset (recommended): keep the layout and visual role, but use generic branding, neutral UI, placeholder QR style, or generated/non-sensitive visuals.
- Keep original asset: preserve the source asset in the draft and final package.
- Remove asset: delete it and redesign the area as a generic placeholder or non-image visual anchor.

Rules:

- Recommend replacement with a neutral asset by default.
- Only keep the original asset if the user explicitly chooses to keep it.
- If the user does not answer, do not keep the original asset.
- List every user-confirmed retained sensitive asset in the final report.
- A retained asset must still pass local-reference and packaging checks.

Purely decorative backgrounds, textures, generic icons, and non-identifying abstract shapes may be kept without confirmation when they do not expose a brand, person, customer, private system, or business fact.

## 6. Convert Template Files

For each selected representative layout:

1. Create a corresponding `slides/<layout>.html` file using short kebab-case names.
2. Keep a fixed 1920x1080 canvas.
3. Load the shared stylesheet with:

```html
<link rel="stylesheet" href="../theme.css" />
```

4. Move reusable visual-system CSS into `theme.css`.
5. Keep page-specific layout CSS in each slide HTML.
6. Preserve useful `data-slot`, `data-slot-type`, and `data-slot-role` attributes when they help future editing.
7. Remove renderer-only, debug, project-controller, and source-tracing attributes unless needed for reuse.
8. Reference only local assets under `../images/...`.
9. Replace sanitized text with neutral English example content.
10. Keep the original visual intent while making the page safe and reusable.

Asset handling:

- Copy only assets used by selected template slides.
- Rename assets when useful for readability and deduplication.
- Do not copy unused source images.
- Do not copy ambiguous sensitive assets unless the user confirmed keeping them.
- Use neutral replacement assets or non-image visual anchors when original images cannot be kept.

## 7. Template Metadata

Write `template.json` according to `template-json-spec.md` and validate it against `template-json.schema.json`.

Required behavior:

- `schema_version` is `"1.0"`.
- `template_id` uses the `PPT-xxxx` format.
- `label.zh_CN`, `label.en_US`, `description.zh_CN`, and `description.en_US` describe the reusable template, not the source deck's private topic.
- `files.theme_css` is `"theme.css"`.
- `files.visual_spec` is `"visual-spec.md"`.
- `files.slides_dir` is `"slides"`.
- `files.images_dir` is `"images"`.
- Do not write `files.package_zip` before the user confirms packaging.
- `slides` includes only the deduplicated representative layouts.
- `source.kind` is `"derived"`.
- `source.file` records the source project directory name.
- `source.canvas` is 1920x1080.
- `warnings` records non-fatal conversion, sanitization, asset replacement, missing asset, and confirmation issues.

Do not write legacy fields such as `name`, `template_dir`, `package_type`, `taxonomy`, `review_status`, `copyright_notice`, `slides[].slots`, `slides[].source_slide`, `slides[].best_for`, or `slides[].risks`.

## 8. Lightweight QA Before Asking To Package

Before ending the draft conversion:

- Validate `template.json` against `template-json.schema.json`.
- Confirm every `template.json.slides[].file` exists.
- Confirm `template.json.slides` matches the current `slides/` files after user edits; stale references to deleted, renamed, or moved files are removed or corrected before packaging.
- Confirm every slide loads `../theme.css`.
- Confirm every local image or SVG reference resolves under `images/`.
- Confirm no slide, CSS, metadata, or visual spec contains obvious sensitive text.
- Confirm `images/` contains no unconfirmed logos, internal screenshots, QR codes, real people, customer case images, private dashboards, or proprietary visuals.
- Confirm repeated source pages were reduced to representative layouts.
- Confirm the draft folder does not contain project runtime files, previews, source presentation files, debug output, or nested packages.
- Run a lightweight overflow check when browser or DOM inspection is available.

After QA, report:

- The draft template folder path.
- Source slide count and extracted reusable layout count.
- The sanitization strategy used.
- User-confirmed retained assets, if any.
- Main warnings or limitations.
- Ask whether to package the draft as the final template ZIP.

Do not create the final ZIP in this step.

## 9. Draft Synchronization After User Edits

After the draft template folder exists, the user's latest file edits are authoritative.

Before continuing refinement, QA, packaging, or reporting final status:

1. Re-read `template.json` and the current `slides/` directory.
2. Remove every `template.json.slides[]` entry whose `file` no longer exists.
3. If a slide file was renamed or moved and the user's intent is clear from the current file path, update the matching `template.json.slides[].file`; otherwise remove the stale entry instead of recreating the old file.
4. Preserve the order of remaining `template.json.slides` entries, unless the user explicitly reordered files or metadata.
5. Add a new `template.json.slides[]` entry for a new slide file only when the file is a valid reusable template page and the layout/title/description can be inferred safely.
6. Re-check image and SVG references after synchronization; remove unused assets only when they are not referenced by any remaining slide or stylesheet.

Do not restore a page just because `template.json` still references it. For example, if the user deleted `slides/market-overview.html` but `template.json.slides` still contains that file, remove that slide entry before QA or packaging.

## 10. Final Packaging After User Confirmation

Only after the user confirms packaging:

1. Add `files.package_zip` to `template.json`, pointing to the sibling ZIP path, for example `../<template-id>-template.zip`.
2. Re-run the lightweight QA checks.
3. Create `<template-id>-template.zip` beside the draft template folder.
4. Include only refined template source files:
   - `template.json`
   - `visual-spec.md`
   - `theme.css`
   - `images/`
   - `slides/`
5. Exclude:
   - `magic.project.js`
   - `index.html`
   - `slide-bridge.js`
   - preview images and preview folders
   - source project files not selected for the template
   - original presentation files
   - renderer debug output
   - unconfirmed sensitive assets
   - intermediate render folders
   - nested `packages/`

If any sensitive or ambiguous asset is discovered during packaging and was not previously confirmed, stop packaging and call `ask_user` before continuing.
