---
name: persona-research
description: Use when the user wants consumer or user research with AI personas — virtual customer interviews, focus groups, concept tests, persona building from uploaded materials, a reusable persona panel, or follow-up questions to a specific persona in an existing study.
---

# Persona Research Skill

Turn one business question into a study: clarify, plan, desk research, AI personas, interviews and focus groups, an evidence-backed report, and a questionnaire for retesting with real people. Each study lives in its own directory and drives the research workspace UI through `study.json`.

## References (Read On Demand)

- Writing or validating any study file -> [reference/file-contracts.md](reference/file-contracts.md). Field names, enums, and `schema_version` must match exactly; the UI treats non-matching files as "not ready".
- Choosing study type, framework, interview guide, or focus-group rules -> [reference/methods.md](reference/methods.md)
- Writing `report.html` -> [reference/report-template.html](reference/report-template.html)
- `ask_user` interaction rules -> the "Interaction Rules (New Research, Deepening, and Follow-ups)" section of the deep-research skill (`deep-research/SKILL.md`). Read that skill before your first `ask_user` call in a conversation and apply only that section as written; its research workflow, depth modes, and report template do not apply to persona research.

## Non-Negotiable Rules

1. No retrieval, persona building, or interviews before the user explicitly confirms the plan through `ask_user`. A timeout, a skip, a tool failure, or returned preference defaults are not approval.
2. Once confirmed, the plan is locked. If the user later wants a different scope, audience, or method, propose a new study instead of editing the locked plan.
3. Every persona utterance comes from `persona_chat`. Never write, paraphrase, or "fill in" a persona answer yourself, in transcripts or in the report.
4. Keep evidence types apart in every conclusion: web sources, AI persona interviews, and your inference. The report must say that respondents are AI-simulated, not real users, and state the effective sample size.
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
studies/<slug>/report.html
studies/<slug>/validation-questionnaire.md
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
| Plan confirmed | `desk_research` | plan=done, desk_research=running; fill `study_type`, `framework`, `limits` |
| Desk research written | `interview` | desk_research=done, interview=running |
| `panel_only` study (no desk research) | `interview` | desk_research=skipped, interview=running |
| All interviewer sub-agents finished | `report` | interview=done (failed only if no interview succeeded), report=running |
| `report.html` written | `validation` | report=done, validation=running |
| `validation-questionnaire.md` written | `done` | validation=done |

When a step stops (unanswered question, user interruption, failure), leave `study.json` at the current phase with that phase still `running`, and keep every file already written. Do not mark later phases.

## Workflow

### Phase 1: Clarify (`clarify`)

1. Run one quick `web_search` with 2-3 differentiated queries to understand the topic's shape. No deep reading yet.
2. Choose the slug, create `studies/<slug>/study.json` with the first state from the table above.
3. If the request leaves material choices open, send at most 3 questions in one direct `ask_user` call: study type (see methods.md), target audience, and the decision or focus the study should inform. Skip questions the user already answered. Questions and options use the user's language and are customized from the pre-search.
4. Clarifying answers obey the deep-research interaction rules: on timeout or skip, state the open question, keep `phase=clarify`, and stop.

### Phase 2: Plan (`plan`)

1. Write `studies/<slug>/plan.md`: objective and decision to inform, study type, framework, target audience and segments, number of personas (default 8), interview rounds (default 5), whether to run a focus group, the interview guide (5-8 core questions), deliverables, and the AI-simulation limitation.
2. Show a short plan summary in your message and call `ask_user` directly with a final `confirm` question that has no `default`. You may add one `select` for persona count or method only if it is genuinely open.
3. Approved: update `study.json` per the table. "Needs changes": revise `plan.md` and confirm again. Timeout, skip, or refusal: stop at `phase=plan` and say the study has not started.

### Phase 3: Desk Research (`desk_research`)

1. Drive `web_search` rounds from the plan's open questions; read the most relevant pages in full with `read_webpages_as_markdown`. Search results are snippets, not evidence.
2. Social media evidence: if platform data skills are in your available skills, use them as described in "Platform Data Skills" below. Otherwise social content is available only through search engines (for example site-restricted queries); do not claim platform-wide coverage, and record this as a limitation.
3. Write `studies/<slug>/desk-research.md`: findings grouped by plan question, each with a numbered source `[S1]` (title, URL, publish date when known), plus a "Limitations" section.
4. Uploaded user materials count as sources too; convert them with the document-converter skill when needed and cite them by file path.

### Phase 4: Personas and Panel (`interview`)

1. Reuse first: `list_dir personas/`, read candidate files, and keep those that match the plan's audience criteria. Do not change a reused persona's identity fields; you may append new `evidence` and update `updated_at`.
2. Create only the missing personas. Each new persona has all 7 dimensions, all 4 layers, and `evidence[]` linking to desk-research sources. Make personas within a segment differ on behavior and attitude, not just demographics; include at least one skeptic or non-user when relevant.
3. `tier`: `evidence_based` when key traits are grounded in cited sources, `generated` otherwise, `imported` when built from user-uploaded materials (interview notes, CRM exports, survey data, and so on).
4. Write `studies/<slug>/panel.json` (see file-contracts.md), including why each persona was selected and whether it was reused. If the user asked to save the group, also write `panels/<panel_id>.json`.

### Phase 5: Interviews (`interview`)

1. Split the personas into at most 4 groups of 2-3. Dispatch one `persona-interviewer` sub-agent per group in the background with the subagents skill (`call_subagent` via `run_sdk_snippet`), then `wait_for_subagents` until all are finished.
2. Each prompt must be self-contained: objective, study directory, assigned persona file paths, the interview guide copied from `plan.md`, the round limit, `max_tokens` for `persona_chat`, the exact output paths, the parallel-context line, what is out of scope (other personas, persona files, study.json, report), and the final report it must return.
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

1. Read `reference/report-template.html` and write `studies/<slug>/report.html` with real content: executive summary and recommendations, findings by segment, each claim linked to interview quotes (transcript file + persona name) and web sources `[S#]`, disagreements and counter-evidence, assumptions and limitations (AI-simulated respondents, effective sample size, failed interviews, search-only social evidence), and methodology.
2. Write `studies/<slug>/validation-questionnaire.md`: the same questions as the interview guide, rewritten for real respondents, plus screening questions matching the target audience and a short guide for comparing real answers with the AI findings.
3. Update `study.json` per the table and reply with links to the report, the questionnaire, and the 3 most important findings.

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
- Evidence records: use `evidence[].type = "web"`, put the post URL in `url`, and start `title` with the platform name, for example `Xiaohongshu: <post title>`.
- In the report's limitations, state which platforms were sampled and how many posts and comments were read.

## Uploaded Materials

When the user uploads materials and asks to build personas from them, read them first (document-converter skill for complex formats), derive personas grounded in the material with `tier=imported` and `evidence[].type=upload` pointing to the file, and cite the file in `evidence[].file`. Do not copy personal identifiers of real individuals into personas.
