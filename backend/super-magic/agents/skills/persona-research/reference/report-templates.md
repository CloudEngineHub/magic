# Report Templates

A report template sets only the visual style of `report.html`: colours, fonts, layout, decoration, and scripts. The report contract below applies whatever the template looks like.

## Where Templates Live

- `templates/<name>.html` at the workspace root, one HTML file per template, shared by every study. The file name is the template's name.
- `templates/voices.html` is the default. `update_study` `created` copies the built-in template there when `templates/` holds no template yet.

## Which Template a Report Uses

1. The template the user names: `报告模板: templates/<name>.html` in the `【研究设置】` line, or a mentioned `templates/*.html` file.
2. Otherwise `templates/voices.html`; if it was deleted, the built-in `reference/report-template.html`.

Write the choice into `plan.md` deliverables as `Report template: templates/<name>.html`, and use that line when writing the report unless the user names another template later.

Use a template only if it is a readable, complete HTML document (`<html` or `<body>`), at most 200 KB, and does not load files from the workspace (relative image or CSS paths; CDN links are fine). Otherwise use the default and say once why. Never delete or fix a user's template on your own.

## Report Contract (Every Template)

- Sections in the order of Phase 6 step 4, with the built-in ids: `hypotheses`, `business`, `summary`, `method`, `findings`, `real-voices`, `tensions`, `personas`, `voices`, `limitations`, `validation`, `sources`. Drop a section only when it truly does not apply.
- Citations are `<a href="#q<N>" class="citation-ref">[Q<N>]</a>` and `<a href="#s<N>" class="citation-ref">[S<N>]</a>`. Each quote card has `id="q<N>"`, `data-source-name` (persona name), and `data-source-title` (the quote); each source card has `id="s<N>"`.
- Every hypothesis, recommendation, and theme carries an evidence bar: web sources N, AI interviews N people, real-person validation status.
- The limitations section says respondents are AI-simulated and states the effective sample size. Never write persona counts or ratios.
- Replace every sample text in the template with study content, and set `<html lang>` to the user's language.
- Keep the template's own scripts. Behaviour a template lacks (citation popovers, persona portraits) is not added; citations then work as plain anchor links.

## Creating or Changing Templates

When the user asks to create or change a template, write only `templates/<name>.html`. No study, no `update_study`, no report.

- Change ("make @templates/x.html green"): edit that file in place.
- Create ("a darker one", "from this uploaded HTML"): write a new `templates/<short-ascii-name>.html` and never overwrite an existing file unless asked. Base it on the mentioned template, the uploaded file, or the built-in `reference/report-template.html`, and keep realistic sample content in every section so the template library can preview it.
- To restyle an existing report, rewrite `studies/<slug>/report.html` from `synthesis.json` with the chosen template.
