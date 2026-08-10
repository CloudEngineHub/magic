# Template Quality Guidelines

Passing schema validation is necessary but not sufficient. A finished template must also be visually coherent, reusable, and presentation-ready.

## Visual Bar

1. Every slide has a clear visual anchor: image, chart, metric block, matrix, process, timeline, quote panel, strong typography, or a scene-specific motif.
2. The cover communicates the visual system immediately; title plus subtitle alone is insufficient.
3. The deck uses multiple layout families and at least three reusable component families.
4. Data pages contain readable sample values, legends, labels, and hierarchy.
5. Text-heavy pages use grouping, sidebars, highlights, numbered structures, or pull quotes.
6. Color roles, typography, spacing, radii, borders, shadows, icons, charts, and image treatment remain coherent.
7. Normal content pages intentionally use the 1920x1080 canvas. Accidental empty lower halves, tiny type, and scattered cards are failures.
8. Default content is realistic and editable. Do not use lorem ipsum, fake contact details, fake URLs, or gray placeholders.

## Scene Page Inventory

Use these as starting points, then adapt to the source:

| Scene | Recommended layouts |
| --- | --- |
| Business report | cover, agenda, executive summary, KPI dashboard, performance, risk, timeline, decision matrix, closing |
| Startup pitch | cover, problem, solution, product, market, business model, traction, go-to-market, team, funding ask |
| Product growth | cover, vision, user insight, funnel, roadmap, comparison, experiment, launch, dashboard |
| Sales marketing | cover, campaign, persona, message, channel, calendar, offer, enablement, performance |
| Education training | cover, goals, agenda, concept, example, activity, knowledge check, resources, recap |
| Academic research | cover, question, literature, methodology, experiment, results, discussion, limitations, conclusion |
| Technology engineering | cover, overview, architecture, workflow, pipeline, benchmark, roadmap, controls, closing |
| Government organization | cover, background, stakeholders, program, implementation, budget, impact, governance, next steps |
| Healthcare | cover, context, population, pathway, study design, outcomes, safety, implementation, closing |
| Culture creative | cover, concept, moodboard, portfolio, timeline, experience, visual system, campaign, closing |

## Assets And Safety

- Prefer a small number of high-impact local assets over decorative clutter.
- Use semantic filenames such as `hero-clinical-pathway.webp` and `texture-paper-grain.webp`.
- Deduplicate repeated images and resize them for their actual slide role.
- Never generate or retain fake logos, fake people, fake dashboards, QR codes, or proprietary UI.
- Recommend neutral replacement for ambiguous sensitive assets; retain originals only after explicit user confirmation.

## Structural Checks

Confirm:

- Before finalization, all temporary material is confined to `.template-work/`. After finalization, the directory contains only the source files, `images/`, `slides/`, generated `previews/`, and `template-assets.json`.
- `template.json` validates against `template-json.schema.json`.
- `category_code` is an active exact taxonomy code, `tag_codes` is non-empty and unique, and `template-assets.json.backend_fields` carries the same values.
- Every slide index points to an existing file and every slide loads `../theme.css`.
- Each slide has at least three useful slot hints and no remote or absolute asset reference.
- No forbidden metadata or legacy conversion residue remains.
- `.template-work/`, reference renders, extracted candidates, contact sheets, downloaded source copies, and QA scratch files are absent from the completed template.

## Browser And Visual Checks

Invoke both webpage QA tools through `run_sdk_snippet` with `sdk.tool.call(...)`, following the Code Mode example in the main skill. Do not call them as standalone tools.

Use `analysis_slide_webpage` through that Code Mode path on all pages when practical, or at minimum on every high-risk page. Fix overflow, clipping, scrollbars, missing images, and aspect-ratio distortion.

Use `visual_understanding_webpage` through that Code Mode path on at least:

- Cover.
- Densest content page.
- Data, process, or comparison page.
- Image-led page.
- Closing page.

Review hierarchy, readability, composition, canvas usage, image quality, and layout repetition. If a sampled page fails, improve it and re-run the relevant checks.

## Completion Report

Report:

```text
status:
source_path:
input_type:
output_dir:
template_id:
category_code:
label.zh_CN:
slide_count:
routing_reason:
visual_reconstruction_summary:
slide_inventory:
removed_or_replaced_sensitive_assets:
validation:
quality_pass:
remaining_limitations:
```
