---
name: persona-research
description: Use when the user wants consumer or user research with AI personas — virtual customer interviews, focus groups, concept tests, persona building from uploaded materials, a reusable persona panel, or follow-up questions to a specific persona in an existing study.
---

# Persona Research Skill

Turn one business question into a study: clarify, plan, desk research, AI personas, interviews and focus groups, an evidence-backed report, and a questionnaire for retesting with real people. Each study lives in its own directory and drives the research workspace UI through `study.json`.

## References (Read On Demand)

- Writing or validating any study file -> [reference/file-contracts.md](reference/file-contracts.md). Field names, enums, and `schema_version` must match exactly; the UI treats non-matching files as "not ready".
- Choosing study type, framework, hypotheses, sample quota, interview guide and its self-check, focus-group rules, and all synthesis rules (theme coding, saturation, verdict and confidence rules, quote self-check, business recommendations) -> [reference/methods.md](reference/methods.md)
- Writing `report.html` -> [reference/report-template.html](reference/report-template.html)
- `ask_user` interaction rules -> the "Interaction Rules (New Research, Deepening, and Follow-ups)" section of the deep-research skill (`deep-research/SKILL.md`). Read that skill before your first `ask_user` call in a conversation and apply only that section as written; its research workflow, depth modes, and report template do not apply to persona research.

## Non-Negotiable Rules

1. No retrieval, persona building, or interviews before the user explicitly confirms the plan through `ask_user`. A timeout, a skip, a tool failure, or returned preference defaults are not approval.
2. Once confirmed, the plan is locked. If the user later wants a different scope, audience, or method, propose a new study instead of editing the locked plan.
3. Every persona utterance comes from `persona_chat`. Never write, paraphrase, or "fill in" a persona answer yourself, in transcripts or in the report.
4. Keep evidence types apart in every conclusion: external sources (web, social, uploads), AI persona interviews, real-person validation, and your inference. The report must say that respondents are AI-simulated, not real users, and state the effective sample size. Verdicts and confidence follow the rules in methods.md: a conclusion backed only by AI interviews is at most `mixed` ("pending real-person validation") and its themes are `to_validate`.
5. Respect the cost limits below. They are hard limits even if the user asks for more; explain the limit instead.
6. Update `study.json` at exactly the points in "Phase State Updates". The UI stepper reads it.
7. Write human-readable text in the user's language. JSON field names and enum values stay in English.

## Cost Limits

| Item | Default | Maximum |
|---|---|---|
| Personas per study | 8 | 12 |
| Interview rounds per persona (one question + one answer = one round) | 5 | 7 |
| Interviewer sub-agents running in parallel | up to 4 | 4 (each handles 2-3 personas) |
| Focus groups per study | 0 (only if the plan includes one) | 2, with 3-6 participants each |
| `persona_chat` `max_tokens` per answer | 400 | 800 |

## Directory Layout

```text
personas/<persona_id>.json          persona library, shared across studies in this project
panels/<panel_id>.json              saved persona groups
studies/<slug>/study.json           study state (drives the UI stepper)
studies/<slug>/plan.md
studies/<slug>/desk-research.md
studies/<slug>/panel.json           personas used in this study and why
studies/<slug>/interviews/<persona_id>.json
studies/<slug>/discussions/<discussion_id>.json
studies/<slug>/synthesis.json       themes, stances, and saturation behind the report
studies/<slug>/report.html
studies/<slug>/validation-questionnaire.md
studies/<slug>/validation-questionnaire.csv
studies/<slug>/validation-results.json   AI vs. real-person comparison
```

- `slug`: a short ASCII kebab-case summary of the topic plus 4 random hex characters, for example `trial-churn-week-two-3f9a`. Use pinyin or English for non-Latin topics. Check with `list_dir studies/` that the directory does not already exist.
- `persona_id`: `p_<short-ascii-slug>_<4 random hex>`, for example `p_zhangwei_7f3a`. The file name is `<persona_id>.json`.
- Use workspace-relative paths everywhere (no leading `/`).

## Phase State Updates

`study.json` phases, in order: `clarify`, `plan`, `desk_research`, `interview`, `report`, `validation`. Top-level `phase` is the running phase, or `done` at the end. Overwrite the whole file each time with `write_file`.

| Moment | `phase` | Phase statuses to set |
|---|---|---|
| Study starts (after the pre-search, before clarifying questions) | `clarify` | clarify=running, all others=pending |
| Clarification answered, or nothing needed clarifying | `plan` | clarify=done, plan=running |
| Plan confirmed | `desk_research` | plan=done, desk_research=running; fill `study_type`, `framework`, `limits`, `decision`, `hypotheses` (all `pending`), `quota`, `guide_review` |
| Desk research written | `interview` | desk_research=done, interview=running |
| `panel_only` study (no desk research) | `interview` | desk_research=skipped, interview=running |
| All interviewer sub-agents finished | `report` | interview=done (failed only if no interview succeeded), report=running |
| `report.html` written | `validation` | report=done, validation=running; hypotheses carry their verdicts |
| Questionnaire `.md` and `.csv` written | `done` | validation=done |
| Real-person answers compared | `done` | validation=done; set `validated_count` and each `hypotheses[].validation` |

When a step stops (unanswered question, user interruption, failure), leave `study.json` at the current phase with that phase still `running`, and keep every file already written. Do not mark later phases.

## Workflow

### Phase 1: Clarify (`clarify`)

1. Run one quick `web_search` with 2-3 differentiated queries to understand the topic's shape. No deep reading yet.
2. Choose the slug, create `studies/<slug>/study.json` with the first state from the table above and `topic_id` set to the current topic ID from `<super_magic_product_context>`. Keep `topic_id` unchanged on every later rewrite.
3. If the request leaves material choices open, send at most 3 `select` questions in one direct `ask_user` call: the decision the study should inform, target audience, and study type (see methods.md). Skip questions the user already answered. Write questions and options in plain business language a shop owner understands, not research jargon, in the user's language and customized from the pre-search. Put the recommended option first, mark it as recommended, and set it as the `default`.
4. Clarifying answers obey the deep-research interaction rules: on timeout or skip, state the open question, keep `phase=clarify`, and stop.

### Phase 2: Plan (`plan`)

1. Name the decision the study supports, for example "whether to build X for segment Y". If the request supports no decision ("just tell me about my customers"), ask the user to narrow it to one decision before planning.
2. Write `studies/<slug>/plan.md`: the decision, study type, framework, target audience, 3-5 hypotheses with support and refute criteria, the sample quota table (segment, criteria, count; at least 25% non-users, skeptics, or churned users), interview rounds (default 5), whether to run a focus group, the interview guide (5-8 core questions), a "Guide self-check" section, deliverables, and the AI-simulation limitation. See methods.md for hypotheses, quota, and the guide self-check.
3. Run the guide self-check before showing the plan: rewrite leading, double-barreled, hypothesis-revealing, and jargon questions, and list each change (before -> after) in "Guide self-check".
4. Show in your message: the decision, every hypothesis with its support and refute criteria, the quota table, and "Guide self-check: N questions rewritten" with one example. Then call `ask_user` directly with one final `select` question and no `default`, with options to start the study as planned, adjust the hypotheses, or adjust the sample. Only the start option is approval.
5. Approved: update `study.json` per the table. Adjustment requested: revise `plan.md` and confirm again. Timeout, skip, or refusal: stop at `phase=plan` and say the study has not started.

### Phase 3: Desk Research (`desk_research`)

1. Drive `web_search` rounds from the plan's open questions; read the most relevant pages in full with `read_webpages_as_markdown`. Search results are snippets, not evidence.
2. Social media evidence: if platform data skills are in your available skills, use them as described in "Platform Data Skills" below. Otherwise social content is available only through search engines (for example site-restricted queries); do not claim platform-wide coverage, and record this as a limitation.
3. Write `studies/<slug>/desk-research.md`: findings grouped by plan question, each with a numbered source `[S1]` (title, URL, publish date when known), plus a "Limitations" section.
4. Uploaded user materials count as sources too; convert them with the document-converter skill when needed and cite them by file path.
5. Number every source `[S#]` once; hypotheses and `synthesis.json` reuse these numbers.

### Phase 4: Personas and Panel (`interview`)

Hard rules for every persona in the study, new or reused:

- Stratify and differentiate personas only by demographic, situational, and behavioral variables (industry, size, city tier, role, usage stage, current workaround) as set in the quota.
- Never write the outcome variables being tested into a persona: not in `needs_pains`, `decision_weights`, `expression`, `story`, or tags. [Wrong] for a willingness-to-pay study, a persona that says "happy to pay for anything that saves time". [Right] "runs 3 stores, pays 2 staff to reconcile orders by hand every evening". A reused persona that already states the tested outcome is not selected for this study.
- At least 25% of the panel are non-users, skeptics, or churned users.
- `layers.cognition.decision_weights` is a qualitative ranking: `[{ "factor", "level": "high" | "medium" | "low" }]`, never numbers.
- Fill `field_sources` for all 7 dimensions (evidence ids, or `"inferred"`) and record cross-layer contradictions in `consistency_notes` instead of smoothing them out.
- `tier` by rule: `imported` when built from user-uploaded materials about real people; otherwise `evidence_based` only when the persona has at least 3 evidence items of type `web`, `social`, or `upload` and `field_sources` cites them for both `needs_pains` and `behavior`; otherwise `generated`. Evidence of type `interview` never counts.

Steps:

1. Reuse first: `list_dir personas/`, read candidate files, and keep those that match a quota segment and pass the rules above. Do not change a reused persona's identity fields; you may append new `evidence`, fill missing `field_sources` and `consistency_notes`, and update `updated_at`.
2. Create only the missing personas to fill the quota. Each new persona has all 7 dimensions, all 4 layers, `field_sources`, and `evidence[]` linking to desk-research sources. Within a segment, make personas differ in behavior and circumstances, not just demographics.
3. Write `studies/<slug>/panel.json` (see file-contracts.md) with `selection[]` for every persona: the reason, whether it was reused, and its quota `segment`. The order of `persona_ids` is the interview order. If the user asked to save the group, also write `panels/<panel_id>.json`.

### Phase 5: Interviews (`interview`)

1. Split the personas into at most 4 groups of 2-3. Dispatch one `persona-interviewer` sub-agent per group in the background with the subagents skill (`call_subagent` via `run_sdk_snippet`), then `wait_for_subagents` until all are finished.
2. Each prompt must be self-contained: objective, study directory, assigned persona file paths, the interview guide copied from `plan.md`, the round limit, `max_tokens` for `persona_chat`, the exact output paths, the quality requirements, the parallel-context line, what is out of scope (other personas, persona files, study.json, report), and the final report it must return. Do not pass the hypotheses to interviewers; they must not steer answers toward them.
3. A focus group, when planned, goes to one sub-agent with its own `discussions/<discussion_id>.json` path and 3-6 participants already interviewed or selected.

```python
from sdk.tool import tool

result = tool.call("call_subagent", {
    "agent_name": "persona-interviewer",
    "task_label": "<short label in the user's language>",
    "prompt": """Objective: run one-on-one interviews with 2 personas for this study.
Study directory: studies/<slug>
Personas: personas/<persona_id_a>.json, personas/<persona_id_b>.json
Interview guide:
1. <question>
2. <question>
Round limit: 5 per persona. persona_chat max_tokens: 400.
Quality: ask each persona at least one "when would you not use this, or give up on it" question. In a focus group, rotate the speaking order every round. When a transcript ends, write its quality field.
Output: studies/<slug>/interviews/<persona_id_a>.json and studies/<slug>/interviews/<persona_id_b>.json
Parallel context: 4 interviewer sub-agents run at the same time. You own only the two personas above. Do not touch other interview files, persona files, study.json, or the report. The research lead merges the results.
Report: each file path, status, completed rounds, and the 2-3 most important findings.""",
    "background": True,
    "resume": False,
})
print(result.content)
session_id = result.data["session_id"]
```

4. After waiting, read every transcript. Count interviews with `status=done` as the effective sample. A failed interview stays failed with its error; do not redo it silently.

### Phase 6: Report and Validation (`report`, `validation`)

Follow the Synthesis section of methods.md for every rule named below.

1. Write `studies/<slug>/synthesis.json`: segments from the quota, themes coded across all completed transcripts with a stance for every interviewed persona, dimensions per segment when useful, and saturation (new themes per interview in interview order; saturated when the last 2 add none). Downweight interviews with `quality.inferred_ratio` of 0.4 or more.
2. Apply the verdict rules to each hypothesis (`verdict`, `verdict_reason`, `evidence_refs`) and the confidence rules to each theme, then write `study.json`.
3. Run the quote self-check script in methods.md. Mismatched quotes are dropped from both files and logged; report the count in the limitations.
4. Read `reference/report-template.html` and write `studies/<slug>/report.html` from `synthesis.json` and the hypotheses, in this order: conclusions by hypothesis (verdict, reason, evidence); business recommendations (target segment priority, one-line positioning, pricing direction as a range with the AI-optimism warning, channels and reach, first-30-day actions; each item lists hypothesis ids, evidence, and what to validate first); executive summary; findings by theme with segment differences and an evidence bar (web sources N, AI interviews N people, real-person validation status); then the existing sections: scope and method, disagreements and counter-evidence, persona panel, interview quotes, assumptions and limitations (AI-simulated respondents, effective sample size, failed and downweighted interviews, saturation, removed quotes, search-only social evidence), real-person validation, and sources. Never write persona counts or ratios ("5 of 8"); use most / some / a few and state that AI samples do not support statistical inference.
5. Write `studies/<slug>/validation-questionnaire.md` for real respondents: screening questions matching the quota, then the guide questions rewritten for real people with ids `Q1`, `Q2`, ... and each tagged with its hypothesis id, for example `Q3 [H2]`; a recommended sample of 8-15 real people; recruiting channels (existing customers, staff and their networks, industry communities); a short invitation script; and how to send the answers back (upload the file in this conversation and ask to compare).
6. Write `studies/<slug>/validation-questionnaire.csv` with the same questions for import into survey tools. Columns: `question_id`, `question`, `type` (`single_choice`, `multiple_choice`, or `open`), `options` (separated by `|`, empty for `open`), `hypothesis_id` (empty for screening questions). Write it with `run_sdk_snippet` using Python's `csv` module and `encoding="utf-8-sig"` so Excel opens it correctly.
7. Update `study.json` per the table and reply with links to the report and the questionnaire, the hypothesis verdicts, and the 3 things to validate first.

## Real-Person Answer Intake

When the user uploads real respondents' answers (spreadsheet, CSV, survey export, interview notes, or screenshots) and asks to compare them with the study:

1. Read `study.json`, `validation-questionnaire.md`, and the uploaded files. Convert documents with the document-converter skill; read screenshots with `visual_understanding`.
2. If nothing is readable or there are zero respondents, explain why and what file would work, write nothing, and leave the validation phase as it is.
3. De-identify before writing anything: remove names, phone numbers, company names, and other identifiers from quotes, and tell the user what kinds of identifiers were removed.
4. Write `studies/<slug>/validation-results.json`: respondent count, source files, the AI vs. human verdict and agreement per hypothesis with short de-identified quotes, per-question comparison, and a summary.
5. Update `study.json`: each compared hypothesis's `validation`, `validated_count`, and validation=done (phase stays `done`). Keep the AI `verdict` unchanged.
6. Update the report's real-person validation section with the comparison, marking disagreements clearly, and update theme confidence where real people now agree (`high`) in `synthesis.json`.
7. Ask with `ask_user` whether to turn the de-identified real answers into `imported` personas in the library; create them only on a yes.

## Follow-Ups in the Same Study

- Before answering, read the existing study files (`study.json`, `plan.md`, transcripts, report) instead of relying on memory.
- "Ask @persona ..." / "追问 @persona": run additional rounds for that persona with `persona_chat` (directly, or through one interviewer sub-agent for several rounds), append them to the existing transcript within the remaining round limit, and update the report section the new answers affect. Say which answers are new.
- A follow-up that changes the locked plan's scope, audience, or method needs a new study.

## Platform Data Skills (When Available)

Some deployments add social-platform data skills (searching posts or videos, reading comments and creator profiles) to your available skills. Check your skills list; never assume one exists.

- Prefer them over site-restricted web search for social evidence in desk research and persona building. Read each platform skill's own SKILL.md before the first call and follow its calling rules.
- Budget per study: at most 6 search calls and 10 comment-page reads across all platforms. Pick the most relevant and highest-engagement items; process large results in code and keep only aggregated findings and short quotes in context.
- Privacy: never copy commenter or creator nicknames, user IDs, avatars, or profile links into personas, transcripts, or the report. Quote short anonymized snippets and cite the post by title and URL.
- Errors: on balance, plan, or permission errors (HTTP 401, 402, 403) or rate limits (429), do not retry. Fall back to web search and record the limitation.
- Evidence records: use `evidence[].type = "social"` with `platform` set to the platform key (for example `xiaohongshu`, `douyin`), put the post URL in `url`, and start `title` with the platform name, for example `Xiaohongshu: <post title>`. Social posts found through web search are also `social`.
- In the report's limitations, state which platforms were sampled and how many posts and comments were read.

## Uploaded Materials

When the user uploads materials and asks to build personas from them, read them first (document-converter skill for complex formats), derive personas grounded in the material with `tier=imported` and `evidence[].type=upload` pointing to the file, and cite the file in `evidence[].file`. Do not copy personal identifiers of real individuals (names, phone numbers, company names) into personas, and tell the user what was removed.
