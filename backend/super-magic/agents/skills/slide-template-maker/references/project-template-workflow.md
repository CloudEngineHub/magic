# Super Magic Project To Template

Use this workflow when the user provides an existing Super Magic slide project and asks to extract a reusable template.

## 1. Inspect Without Modifying

1. Read `magic.project.js` and confirm `type: "slide"`.
2. Read the configured slide order and confirm every referenced HTML file exists.
3. Inspect the configured or rendered width and height for every page. Require one shared aspect ratio, record that canvas, and preserve it in the template.
4. Inspect shared CSS, page-level CSS, local assets, charts, and runtime dependencies.
5. Do not modify the source project.

Stop and ask for the correct project directory if the configuration is missing, invalid, or incomplete.

## 2. Select Reusable Layouts

Analyze all source pages by structure and visual role, not by title alone.

- Group pages that share the same layout and component combination.
- Keep the clearest representative from each useful layout family.
- Prefer cover, agenda, section, narrative, KPI, dashboard, comparison, process, timeline, quote, image story, chart, table, conclusion, and appendix layouts when present.
- Record how many source pages were reduced into how many reusable template pages.

Do not turn the entire project into a cleaned copy of the original deck.

## 3. Create A Standalone Template

Plan the extracted page inventory, then call `create_slide_template_project` to create a new `<template-id>/` directory at the workspace root; never create it inside the source project or under a `slide-templates/` prefix. Put temporary copied pages, asset candidates, and inspection output under the returned `working_directory`.

- Rewrite source-specific text into realistic neutral sample content.
- Move reusable visual rules into `theme.css` and document them in `visual-spec.md`.
- Copy only assets used by selected template pages.
- Remove project controllers, `magic.project.js`, `index.html`, `slide-bridge.js`, debug attributes, and unused scripts.
- Preserve useful `data-slot` attributes and add `data-content-hint` where the editing intent is not obvious.
- Use `source.kind: "derived"` and `source.method: "project-extract"`.
- Set `source.canvas` to the source project's fixed canvas. Do not replace a square source with the default `1920x1080` canvas.
- After authoring, call `finalize_slide_template` so `previews/` and `template-assets.json` are generated beside the source files and the temporary working directory is removed.

## 4. Sensitive Content

Always neutralize private text, customer facts, internal metrics, credentials, private URLs, identifiers, and unpublished roadmap data.

Ask before keeping any logo, real person, customer image, internal screenshot, product UI, dashboard, QR code, or proprietary icon. Recommend neutral replacement. If the user does not answer, do not retain the original asset.

## 5. Verification

- Confirm the source project is unchanged.
- Confirm the template contains the required source files plus the generated `previews/` and `template-assets.json` sidecars after finalization.
- Confirm `.template-work/` and temporary copied source material are absent after successful finalization.
- Confirm repeated pages were reduced to meaningful layouts.
- Confirm all local asset references resolve.
- Run the structural and sampled visual checks from `quality-guidelines.md`.
