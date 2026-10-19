---
name: persona-research
description: Use when the user wants consumer or user research with AI personas — virtual customer interviews, focus groups, concept tests, persona building from uploaded materials, a reusable persona panel, or follow-up questions to a specific persona in an existing study.
---

# Persona Research Skill

Turn one business question into a study: clarify, plan, desk research, AI personas, interviews and focus groups, an evidence-backed report, and a questionnaire for retesting with real people. Each study lives in its own directory and drives the research workspace UI through `study.json`.

## References (Read On Demand)

- Calling the study tools (`update_study`, `save_personas`, `check_interviews`, `save_study_synthesis`, `save_validation_questionnaire`) -> [reference/tools.md](reference/tools.md). Read it before the first call in a conversation.
- Field meanings of the study files, and writing `validation-results.json` -> [reference/file-contracts.md](reference/file-contracts.md). The tools write every other structured file.
- Choosing study type, framework, hypotheses and their `outcome_terms`, sample quota, persona writing rules, interview guide and its self-check, the probing protocol, focus-group rules, real-voice sampling, and all synthesis rules (theme coding, prompted answers, homogeneity, saturation, verdict and confidence rules, quote checks, business recommendations) -> [reference/methods.md](reference/methods.md)
- Writing `report.html`, choosing its template, and creating or changing report templates (such a request alone starts no study) -> [reference/report-templates.md](reference/report-templates.md)
- `ask_user` interaction rules -> the "Interaction Rules (New Research, Deepening, and Follow-ups)" section of the deep-research skill (`deep-research/SKILL.md`). Read that skill before your first `ask_user` call in a conversation and apply only that section as written; its research workflow, depth modes, and report template do not apply to persona research.

## Non-Negotiable Rules

1. No retrieval, persona building, or interviews before the user explicitly confirms the plan through `ask_user`. A timeout, a skip, a tool failure, or returned preference defaults are not approval.
2. Once confirmed, the plan is locked. If the user later wants a different scope, audience, or method, propose a new study instead of editing the locked plan.
3. Every persona utterance comes from `persona_chat`. Never write, paraphrase, or "fill in" a persona answer yourself, in transcripts or in the report.
4. Keep evidence types apart in every conclusion: external sources (web, social, uploads), AI persona interviews, real-person validation, and your inference. The report must say that respondents are AI-simulated, not real users, and state the effective sample size. Verdicts and confidence follow the rules in methods.md: a conclusion backed only by AI interviews is at most `mixed` ("pending real-person validation") and its themes are `to_validate`.
5. Respect the cost limits below. They are hard limits even if the user asks for more; explain the limit instead.
6. Structured study files are written only by the study tools (reference/tools.md). Never write or patch `study.json`, `panel.json`, persona files, transcripts, `synthesis.json`, or the questionnaire CSV with file tools or Python.
7. Write human-readable text in the user's language. JSON field names and enum values stay in English.

## Cost Limits

| Item | Default | Maximum |
|---|---|---|
| Personas per study | 8 | 12 |
| Interview rounds per persona (one question + one answer = one round) | 5 | 7 |
| Interviewer sub-agents running in parallel | up to 4 | 4 (each handles 2-3 personas) |
| Focus groups you plan yourself | 0 (only if the plan includes one) | 2, with 3-6 participants each |
| Focus groups the user asks for later | as requested | no planning cap; `persona_chat` stops at 10 per study as a safety limit |
| `persona_chat` `max_tokens` per answer | 400 | 800 |

## Directory Layout

```text
personas/<persona_id>.json          persona library, shared across studies in this project
panels/<panel_id>.json              saved persona groups
templates/<name>.html               report templates (visual style only), shared across studies
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

- `update_study` creates the study directory and `save_personas` creates persona ids; use the paths they return.
- Use workspace-relative paths everywhere (no leading `/`).

## Phase State Updates

`study.json` drives the UI stepper. Move it only with `update_study`, at these moments: `created` (study starts), `clarified`, `plan_confirmed`, `desk_research_done` or `desk_research_skipped`, `interviews_finished`, `report_written`, `questionnaire_written`, and `validation_compared`. The tool sets every phase status and refuses an event that does not fit the current phase.

When a step stops (unanswered question, user interruption, failure), send no event: the current phase stays running, and every file already written is kept.

## Workflow

### Phase 1: Clarify (`clarify`)

1. Run one quick `web_search` with 2-3 differentiated queries to understand the topic's shape. No deep reading yet.
2. Create the study with `update_study` event `created` (it links the study to the current topic).
3. If the request leaves material choices open, send at most 3 `select` questions in one direct `ask_user` call: the decision the study should inform, target audience, and study type (see methods.md). Skip questions the user already answered, including settings in a `【研究设置】` line at the end of the message (`访谈人数` = persona count, `访谈轮数` = interview rounds, `研究方式` = study type); never ask those again. When `研究方式` reads `自定义：<text>`, pick the closest study type, use the user's text to shape the framework and plan, and do not ask about study type. When `指定人设` lists persona files, use exactly those personas as the interview panel without rewriting them, and recruit extra personas only if `访谈人数` is larger than the list. Write questions and options in plain business language a shop owner understands, not research jargon, in the user's language and customized from the pre-search. Put the recommended option first, mark it as recommended, and set it as the `default`.
4. Clarifying answers obey the deep-research interaction rules: on timeout or skip, state the open question, keep `phase=clarify`, and stop.

### Phase 2: Plan (`plan`)

1. Name the decision the study supports, for example "whether to build X for segment Y". If the request supports no decision ("just tell me about my customers"), ask the user to narrow it to one decision before planning.
2. Write `studies/<slug>/plan.md`: the decision, study type, framework, target audience, 3-5 hypotheses with support and refute criteria and `outcome_terms`, the sample quota table (segment, criteria, count; at least 25% non-users, skeptics, or churned users; counts add up to `访谈人数` when set), interview rounds (`访谈轮数` when set, otherwise 5), whether to run a focus group, the interview guide (core questions = rounds minus 1 or 2, one question each), a "Guide self-check" section, deliverables with the report template (report-templates.md), and the AI-simulation limitation. See methods.md for hypotheses, quota, and the guide self-check.
3. Run the guide self-check before showing the plan: rewrite leading, double-barreled, hypothesis-revealing, jargon, and sequence-priming questions, and list each change (before -> after) in "Guide self-check".
4. Show in your message: the decision, every hypothesis with its support and refute criteria, the quota table, and "Guide self-check: N questions rewritten" with one example. Then call `ask_user` directly with one final `select` question and no `default`, with options to start the study as planned, adjust the hypotheses, or adjust the sample. Only the start option is approval.
5. Approved: call `update_study` event `plan_confirmed` with the plan fields. Adjustment requested: revise `plan.md` and confirm again. Timeout, skip, or refusal: stop at the plan phase and say the study has not started. If clarification was answered or skipped as unnecessary, send `clarified` before showing the plan.

### Phase 3: Desk Research (`desk_research`)

1. Drive `web_search` rounds from the plan's open questions; read the most relevant pages in full with `read_webpages_as_markdown`. Search results are snippets, not evidence.
2. Real voices: if platform data skills are in your available skills, sampling them is required, not optional; follow "Real Voices" in methods.md and "Platform Data Skills" below. Otherwise social content is available only through search engines (for example site-restricted queries); do not claim platform-wide coverage, and record this as a limitation.
3. Write `studies/<slug>/desk-research.md`: findings grouped by plan question, each with a numbered source `[S1]` (title, URL, publish date when known), a "Real Voices" section, and a "Limitations" section.
4. Uploaded user materials count as sources too; convert them with the document-converter skill when needed and cite them by file path.
5. Number every source `[S#]` once; hypotheses and `synthesis.json` reuse these numbers.
6. Call `update_study` event `desk_research_done` with `social_sampling` (what was sampled, or why nothing was).

### Phase 4: Personas and Panel (`interview`)

Hard rules for every persona in the study, new or reused:

- Stratify and differentiate personas only by demographic, situational, and behavioral variables (industry, size, city tier, role, usage stage, current workaround) as set in the quota.
- Personas describe situations, not verdicts: write them as if you did not know the hypotheses (methods.md). [Wrong] for a willingness-to-pay study, a persona that says "happy to pay for anything that saves time". [Right] "runs 3 stores, pays 2 staff to reconcile orders by hand every evening". `save_personas` rejects stance fields containing a hypothesis's `outcome_terms`; rewrite them, or do not select that reused persona. Reuse only personas built for this study's category.
- At least 25% of the panel are non-users, skeptics, or churned users.
- `layers.cognition.decision_weights` is a qualitative ranking: `[{ "factor", "level": "high" | "medium" | "low" }]`, never numbers.
- Fill `field_sources` for all 7 dimensions (evidence ids, or `"inferred"`) and record cross-layer contradictions in `consistency_notes` instead of smoothing them out.
- `save_personas` sets `tier` by rule: at least 3 `web`, `social`, or `upload` evidence items cited by both `needs_pains` and `behavior` make a persona `evidence_based`. Cite evidence honestly; do not pad it to reach the tier.

Steps:

1. Reuse first: `list_dir personas/`, read candidate files, and keep those that match a quota segment and pass the rules above.
2. Draft only the missing personas to fill the quota. Each new persona has all 7 dimensions, all 4 layers, `field_sources`, and evidence linking to desk-research sources. Within a segment, make personas differ in behavior and circumstances, not just demographics.
3. Run the persona self-check in methods.md: no stance field may let a reader predict the persona's answer to any hypothesis.
4. Save reused and new personas together with one `save_personas` call, in interview order, each with its quota `segment` and selection reason. Set `library_panel_name` only if the user asked to save the group.

### Phase 5: Interviews (`interview`)

1. Split the personas into at most 4 groups of 2-3. Dispatch one `persona-interviewer` sub-agent per group in the background with the subagents skill (`call_subagent` via `run_sdk_snippet`), then `wait_for_subagents` until all are finished.
2. Each prompt must be self-contained: objective, study directory, assigned persona file paths, the interview guide copied from `plan.md`, the round limit, `max_tokens` for `persona_chat`, the exact output paths, the quality requirements, the parallel-context line, what is out of scope (other personas, persona files, study.json, report), and the final report it must return. Do not pass the hypotheses to interviewers; they must not steer answers toward them.
3. A focus group, when planned, goes to one sub-agent with its own `discussions/<discussion_id>.json` path, a one-line topic in the user's language (passed as `topic` on round 1), and 3-6 participants already interviewed or selected. Each focus group of a study gets its own file and topic.

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
Quality: one question per round. Follow the probing protocol: start each topic from the most recent real occasion, go one layer deeper on key answers, run one pressure round with the strongest counter-argument, and ask at least one "when would you not use this, or give up on it" question. Do not quote profile details the persona has not said. In a focus group, rotate the speaking order every round.
Transcripts: studies/<slug>/interviews/<persona_id_a>.json and studies/<slug>/interviews/<persona_id_b>.json. persona_chat records every round (pass transcript_path and round_number); close each transcript with finish_persona_transcript.
Parallel context: 4 interviewer sub-agents run at the same time. You own only the two personas above. Do not touch other transcripts, persona files, study.json, or the report. The research lead merges the results.
Report: each file path, status, completed rounds, and the 2-3 most important findings.""",
    "background": True,
    "resume": False,
})
print(result.content)
session_id = result.data["session_id"]
```

4. After waiting, call `check_interviews`. For unfinished transcripts (interrupted or not started), dispatch interviewer sub-agents again with a continuation brief: the same personas and transcript paths, the round to continue from, and "the transcript already holds the earlier rounds". A failed interview stays failed with its error; redo it only after its cause is fixed, and say so.
5. When `check_interviews` shows no unfinished transcript, call `update_study` event `interviews_finished`, then read the completed transcripts.

### Phase 6: Report and Validation (`report`, `validation`)

Follow the Synthesis section of methods.md for every rule named below.

1. Code themes across all completed transcripts, judge each hypothesis by the verdict rules and each theme by the confidence rules, and save everything with one `save_study_synthesis` call: segments, themes with stances and exact-word quotes, dimensions when useful, and hypothesis verdicts with their quotes and sources.
2. Read its result: use the adjusted verdicts and confidence it reports, and carry the removed-quote count, downweighted interviews, saturation, and any homogeneity warning into the report's limitations.
4. Read the study's report template (report-templates.md) and write `studies/<slug>/report.html` from `synthesis.json` and the hypotheses, in the template's visual style and following the report contract, in this order: bottom line first (a decision verdict of go / conditional / no-go for the decision the study informs, one sentence that answers the research question, 2-3 one-line reasons with citations, what would change the verdict, and the 3 things to validate first); conclusions by hypothesis (verdict, reason, evidence; the support/refute criteria folded); business recommendations that follow the verdict (target segment priority, one-line positioning, pricing direction as a range with the AI-optimism warning, channels and reach, first-30-day actions; each item lists hypothesis ids, evidence, and what to validate first; with a no-go verdict title it "if you still want to try" and give only the conditions and cheap tests, never a launch plan); findings by theme, at most 6 in full (the ones that drive the verdict, with segment differences and an evidence bar: web sources N, AI interviews N people, real-person validation status) and any others as a one-line list; then the existing sections: scope and method, real voices vs. AI voices (full rows only where platform quotes differ from the interviews or say nothing; agreeing themes share one line), disagreements and counter-evidence, persona panel, interview quotes, assumptions and limitations (AI-simulated respondents, effective sample size, failed and downweighted interviews, saturation, removed quotes, search-only social evidence, leak-check overrides or a skipped leak check), real-person validation, and sources. Never write persona counts or ratios ("5 of 8"); use most / some / a few and state that AI samples do not support statistical inference.
5. Write `studies/<slug>/validation-questionnaire.md` for real respondents: screening questions matching the quota, then the guide questions rewritten for real people with ids `Q1`, `Q2`, ... and each tagged with its hypothesis id, for example `Q3 [H2]`; a recommended sample of 8-15 real people; recruiting channels (existing customers, staff and their networks, industry communities); a short invitation script; and how to send the answers back (upload the file in this conversation and ask to compare).
6. Save the same questions with `save_validation_questionnaire`; it writes `validation-questionnaire.csv` for survey tools.
7. Call `update_study` with `report_written` after `report.html` (step 4) and with `questionnaire_written` after step 6. Reply with links to the report and the questionnaire, the hypothesis verdicts, and the 3 things to validate first.

## Real-Person Answer Intake

When the user uploads real respondents' answers (spreadsheet, CSV, survey export, interview notes, or screenshots) and asks to compare them with the study:

1. Read `study.json`, `validation-questionnaire.md`, and the uploaded files. Convert documents with the document-converter skill; read screenshots with `visual_understanding`.
2. If nothing is readable or there are zero respondents, explain why and what file would work, write nothing, and leave the validation phase as it is.
3. De-identify before writing anything: remove names, phone numbers, company names, and other identifiers from quotes, and tell the user what kinds of identifiers were removed.
4. Write `studies/<slug>/validation-results.json`: respondent count, source files, the AI vs. human verdict and agreement per hypothesis with short de-identified quotes, per-question comparison, and a summary.
5. Call `update_study` event `validation_compared` with `validated_count` and each compared hypothesis's result. The AI `verdict` stays unchanged.
6. Update the report's real-person validation section with the comparison, marking disagreements clearly. Where real people now agree, save the synthesis again with `save_study_synthesis` and those themes at `high`.
7. Ask with `ask_user` whether to turn the de-identified real answers into `imported` personas in the library; create them only on a yes.

## Follow-Ups in the Same Study

- Before answering, read the existing study files (`study.json`, `plan.md`, transcripts, report) instead of relying on memory.
- "Ask @persona ..." / "追问 @persona": run additional rounds for that persona with `persona_chat` (directly with the transcript's `transcript_path` and next `round_number`, or through one interviewer sub-agent for several rounds) within the remaining round limit (when none remain, tell the user instead of calling `persona_chat`), close the transcript again with `finish_persona_transcript`, and update the report section the new answers affect. Say which answers are new.
- When the user mentions a persona file (`personas/<id>.json`) or that persona's transcript (`interviews/<id>.json`) and asks what the persona would think, say, or do, treat it as the follow-up above and get the answer from `persona_chat`. Never answer in the persona's voice yourself; questions about the file itself (summarize, compare, quote) are answered from the file.
- "Run another focus group" / "再组织一场讨论": the user may add focus groups beyond the plan. Before starting, say in one message: the topic, the participants and why, and the estimated cost (roughly one interviewer's worth of credits per group of 5 × 5 rounds). Choose participants by purpose:
  - Reuse panel members to go deeper on what they already said or to make them react to each other.
  - Bring in new personas (reused library personas or new ones, saved with `save_personas` `append: true`) when a finding rests on few people, all supporters share one segment, or the user wants to know whether it holds for others. A finding confirmed by new people is stronger evidence than the same people repeating it.
  Synthesis counts each persona once per theme (`stance_by_persona`), however many discussions they joined, so repeating the same people never adds votes; say in the report which conclusions were confirmed by newly added personas.
- A follow-up that changes the locked plan's scope, audience, or method needs a new study.

## Platform Data Skills (When Available)

Some deployments add social-platform data skills (searching posts or videos, reading comments and creator profiles) to your available skills. Check your skills list; never assume one exists.

- Prefer them over site-restricted web search for social evidence in desk research and persona building. Read each platform skill's own SKILL.md before the first call and follow its calling rules.
- Budget per study: at most 8 search calls and 20 comment-page reads across all platforms. Pick the most relevant and highest-engagement items; process large results in code and keep only aggregated findings and short quotes in context.
- Privacy: never copy commenter or creator nicknames, user IDs, avatars, or profile links into personas, transcripts, or the report. Quote short anonymized snippets and cite the post by title and URL.
- Errors: on balance, plan, or permission errors (HTTP 401, 402, 403) or rate limits (429), do not retry. Fall back to web search and record the limitation.
- Evidence records: use `evidence[].type = "social"` with `platform` set to the platform key (for example `xiaohongshu`, `douyin`), put the post URL in `url`, and start `title` with the platform name, for example `Xiaohongshu: <post title>`. Social posts found through web search are also `social`.
- In the report's limitations, state which platforms were sampled and how many posts and comments were read.

## Persona Building Requests

When the user asks only to build personas (for example "只构建人设，不做研究", or uploads interviews, surveys, or customer data to turn into personas) and asks for no study, run this short flow instead of Phases 1-6. Rule 1 does not apply; the draft approval below replaces plan approval.

1. `update_study` `created` with `study_type: "persona_build"`.
2. Read uploaded materials first (document-converter skill for complex formats). Without materials, you may run up to 2 `web_search` rounds for evidence. If the input only has demographics, say the personas would be mostly inferred and ask with `ask_user` whether to continue or add material.
3. Draft at most 6 personas: one per real person in uploaded interviews, otherwise distinct by situation and behavior. Remove personal identifiers of real individuals (names, phone numbers, company or shop names) and use pseudonyms.
4. Show the drafts in your message: name, one-line identity, 2-3 key traits, what each is based on, and the expected tier (`imported` for uploaded material about real people, otherwise by the evidence rule). List the kinds and counts of identifiers removed. Then call `ask_user` with one `select` question and no `default`: save to the library, or adjust first. Only the save option is approval; on adjust, revise and ask again.
5. On approval, call `save_personas` (`from_uploaded_people: true` and `upload` evidence citing `evidence[].file` for uploaded people). Reply with the saved names; do not interview them or write a report.

`manual` personas are written by the user in the persona library. Reuse them like any other persona, but never change their content or tier.
