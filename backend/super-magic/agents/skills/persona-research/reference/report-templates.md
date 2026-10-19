# Report Templates

A report template sets only the visual style of `report.html`: colours, fonts, layout, decoration, and scripts. The report contract below applies whatever the template looks like, section order included: when a template's sample sections come in another order (older copies of `templates/voices.html` too), follow the contract order, not the template's.

## Where Templates Live

- `templates/<name>.html` at the workspace root, one HTML file per template, shared by every study. The file name is the template's name.
- `templates/voices.html` is the default. `update_study` `created` copies the built-in template there when `templates/` holds no template yet.

## Which Template a Report Uses

1. The template the user names: `报告模板: templates/<name>.html` in the `【研究设置】` line, or a mentioned `templates/*.html` file.
2. Otherwise `templates/voices.html`; if it was deleted, the built-in `reference/report-template.html`.

Write the choice into `plan.md` deliverables as `Report template: templates/<name>.html`, and use that line when writing the report unless the user names another template later.

Use a template only if it is a readable, complete HTML document (`<html` or `<body>`), at most 200 KB, and does not load files from the workspace (relative image or CSS paths; CDN links are fine). Otherwise use the default and say once why. Never delete or fix a user's template on your own.

## Report Contract (Every Template)

- Sections in the order of Phase 6 step 4, with the built-in ids: `summary` (the bottom line, always first), `hypotheses`, `business`, `method`, `findings`, `real-voices`, `tensions`, `personas`, `voices`, `limitations`, `validation`, `sources`. Drop a section only when it truly does not apply.
- Citations are `<a href="#q<N>" class="citation-ref">[Q<N>]</a>` and `<a href="#s<N>" class="citation-ref">[S<N>]</a>`. Each quote card has `id="q<N>"`, `data-source-name` (persona name), and `data-source-title` (the quote); each source card has `id="s<N>"`.
- Every hypothesis, recommendation, and theme carries an evidence bar: web sources N, AI interviews N people, real-person validation status.
- The bottom line opens with a decision badge (`decision-go`, `decision-conditional`, or `decision-nogo` in the default template) and a one-sentence answer before any detail; the rest of the report never contradicts it.
- The limitations section says respondents are AI-simulated and states the effective sample size. Never write persona counts or ratios.
- Charts and data tables are optional inline fragments chosen by report-charts.md, placed in `findings` (or `hypotheses`), never in `summary`. They carry their own styles, so any template shows them; a report without them is correct when the data does not warrant one.
- Replace every sample text in the template with study content, and set `<html lang>` to the user's language.
- Keep the template's own scripts. Behaviour a template lacks (citation popovers, persona portraits) is not added; citations then work as plain anchor links.

## Images

- Image slots are `figure[data-image-slot]` elements. `data-image-hint` says what fits, `data-image-source` is `search`, `generate`, or `any` (search first), and `data-image-ratio` is the shape. A template without slots gets no images; never add images it does not ask for.
- Fill each slot with one image that fits this study, or delete the whole figure. A finished report never contains `.image-placeholder` or a broken image.
- Search with `image_search` for real products, places, and settings. Use the returned image URL as `src` and caption it with the source site, linked to its page.
- Generate with `generate_images` for concepts and scenes no photo shows. Save into `studies/<slug>/images/`, use `src="images/<file>"`, and caption it as an AI-generated illustration.
- Images illustrate; they are never evidence. Do not cite them as `[S#]` or `[Q#]` or base claims on them. Never generate a real person, a real brand's product, or the personas (their portraits come from the template script), and skip photos of identifiable private people.
- Per report: at most 4 images, one `image_search` call, and one `generate_images` call. On an error or no fitting result, delete the slot instead of retrying.

## Creating or Changing Templates

When the user asks to create or change a template, write only `templates/<name>.html`. No study, no `update_study`, no report.

- Change ("make @templates/x.html green"): edit that file in place.
- Create ("a darker one", "from this uploaded HTML"): write a new `templates/<short-ascii-name>.html` and never overwrite an existing file unless asked. Base it on the mentioned template, the uploaded file, or the built-in `reference/report-template.html`, and keep realistic sample content in every section so the template library can preview it. Image slots stay as placeholders in a template.
- To restyle an existing report, rewrite `studies/<slug>/report.html` from `synthesis.json` with the chosen template.
