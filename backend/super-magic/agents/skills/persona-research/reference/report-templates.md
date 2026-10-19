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

- Use this section order and the built-in ids: `summary` (the bottom line, always first), `hypotheses`, `business`, `method`, `findings`, `real-voices`, `tensions`, `personas`, `voices`, `limitations`, `validation`, `sources`. Drop a section only when it truly does not apply.
- Citations are `<a href="#q<N>" class="citation-ref">[Q<N>]</a>` and `<a href="#s<N>" class="citation-ref">[S<N>]</a>`. Each quote card has `id="q<N>"`, `data-source-name` (persona name), and `data-source-title` (the quote); each source card has `id="s<N>"`.
- Every hypothesis, recommendation, and theme carries an evidence bar: web sources N, AI interviews N people, real-person validation status.
- The bottom line opens with a decision badge (`decision-go`, `decision-conditional`, or `decision-nogo` in the default template) and a one-sentence answer before any detail; the rest of the report never contradicts it.
- State next to the opening answer that interviewees are AI-simulated, give the effective sample size, and say whether real-person validation is done. Repeat the full limitations in `limitations`. Sample accounting may use numbers; never count personas supporting a claim or turn their answers into ratios. Use most / some / a few, scoped to the AI interviews, not to real users.
- Charts and data tables are optional inline fragments chosen by report-charts.md, placed in `findings` (or `hypotheses`), never in `summary`. They carry their own styles, so any template shows them; a report without them is correct when the data does not warrant one.
- Replace every sample text in the template with study content, and set `<html lang>` to the user's language.
- Keep the template's own scripts. Behaviour a template lacks (citation popovers, persona portraits) is not added; citations then work as plain anchor links.

## Write for a Reader Making a Decision

Before styling, draft the answer, its strongest evidence, what remains unknown, and the next action. A reader scanning only the opening and headings should understand the proposed decision and why it remains conditional.

- A short title names the decision or subject; the opening answer states the recommendation and its condition. Use a concrete judgment for each finding heading, not a topic label or a slogan. Prefer "Test a weekly task before adding features" to "Unlock a new retention journey". Do not repeat the research question as a subtitle.
- Each paragraph makes one point in 1-3 sentences: what happened or was said, what it suggests, and why it matters for this decision. Keep a connected explanation when the reasoning needs it; do not split it into disconnected slogans. Use familiar words, specific subjects and verbs. Explain a necessary research term on first use.
- Put the citation directly after the fact it supports. Say "AI interview signal", "external evidence", "real-person result", or "our inference" when the distinction could be missed. A source about a related market does not prove the study's core claim. Preserve exact quotes; edit only the surrounding explanation.
- Recommendations name an action, its audience or context, and the observable result to check. Do not invent an owner, deadline, threshold, price, cause, or quote to make the wording concrete. Say what is missing when the evidence cannot support a decision.
- Delete generic introductions, exaggerated benefits, abstract noun chains, metaphors that hide the action, and repeated summaries. Replace "improve the end-to-end value experience" with the actual step and result. Keep a fact once in full; later sections may point back to it. Keep conflicting findings separate rather than smoothing them into a positive story.
- Use a short list for parallel reasons or steps, a table for a real comparison, and paragraphs for reasoning. Bold only the judgment or action that deserves attention. Move judging criteria and secondary detail into labeled `details`; keep counter-evidence, missing validation and other limits that can change the decision visible beside it.

Example (illustrative wording, not research evidence):

| Hard to act on | Clear enough to assess |
|---|---|
| The research comprehensively reveals opportunities to empower a sustainable retention loop. | First test whether trial users can finish one weekly task. AI interviews suggest they forget the app after trying it; real users have not confirmed the reason. |
| Users lack a first win, so onboarding is the core cause of churn. | Our inference: helping users finish a first task may improve return visits. The AI interviews suggest this; they do not establish the cause of churn. |
| Strengthen value perception and optimize the experience. | Ask trial users to complete their next weekly task with the app, and record where they stop. Use the result to decide which onboarding step to change. |

### Keep the Opening Small and Honest

Before any image, method card or persona panel: short title, decision badge, one-sentence answer, 2-3 cited reasons, evidence basis and AI-simulation label, then what would change the answer and the 3 things to validate first (each tied to a hypothesis and a concrete test). If evidence is incomplete, say what cannot yet be decided instead of filling the space with a positive conclusion.

Keep the title compact enough for the answer to be visible on a typical laptop. Do not force a one-screen fit by clipping, shrinking or hiding material caveats. Use readable body text near 16px, relaxed line-height and a bounded reading width; let long titles, source names and badges wrap. Use spacing and type weight to group content, with one restrained emphasis color. No decorative cover before the decision, fixed-height text boxes, or walls of bold text. Images are optional supporting material after the decision content.

### What Each Section Contains

| Section | Content |
|---|---|
| `summary` | Opening described above; decision classes and confidence follow methods.md. Show homogeneity warnings and skipped or overridden leak checks beside the verdict. |
| `hypotheses` | Each hypothesis's verdict, reason and evidence; fold support/refute criteria. |
| `business` | Target segment priority, one-line positioning, pricing direction as a range with the AI-optimism warning, channels and reach, first-30-day actions. Each item lists hypothesis ids, evidence, and what to validate first. For no-go, title it "If you still want to try" and give conditions and cheap tests only, never a launch plan. |
| `method` | Scope, framework, completed vs. planned interviews and rounds, and any focus group actually run. |
| `findings` | At most 6 decision-relevant themes in full, strongest first, with segment differences and counter-evidence beside the claim. Other themes get one line and a citation each. |
| `real-voices` | Full rows only where public platform quotes differ from AI interviews or are silent; agreeing themes share one cited line. |
| `tensions`, `personas`, `voices` | Disagreements, persona panel, and exact interview quotes with transcript links. |
| `limitations` | AI simulation, effective sample, failed and downweighted interviews, saturation, removed quotes, search-only social evidence, and leak-check overrides or a skipped check. |
| `validation`, `sources` | Real-person validation plan/results and all cited sources. Show the comparison table only after answers have actually been compared. |

Before delivery, read only the title, opening and section headings once. Can the reader state the recommendation, evidence type, main uncertainty and next test? Then compare the text with `synthesis.json` and the transcripts: no stronger claims, missing conditions, altered quotes, invented specifics or repeated paragraphs. Check citation targets and inspect the rendered page at wide and narrow widths when a preview is available; unrendered output is not visual acceptance.

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
