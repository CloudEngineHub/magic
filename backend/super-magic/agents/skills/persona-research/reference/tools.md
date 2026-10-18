# Persona Research Tools

These tools write every structured study file. Call them from `run_sdk_snippet` with `tool.call(...)` and print `result.content`. Never write `study.json`, `panel.json`, persona files, transcripts, `synthesis.json`, or the questionnaire CSV with `write_file`, `edit_file`, or Python; the tools assign ids, round indexes, and tiers, check the file contracts, and apply the rules in methods.md. When a tool rejects a call, `result.content` names the problem and nothing was written: fix the arguments and call it again.

Each tool returns `result.data["study_dir"]` where relevant. Pass `study_dir` as `studies/<slug>`.

```python
from sdk.tool import tool

result = tool.call("update_study", {"event": "clarified", "study_dir": "studies/<slug>"})
print(result.content)
```

## update_study

Creates the study and moves `study.json` through its phases. You report what happened; the tool sets every phase status, keeps `topic_id`, and refuses events that do not fit the current phase.

| `event` | Call it when | Extra arguments |
|---|---|---|
| `created` | After the pre-search, before clarifying questions | `title`, `question` (the user's words, verbatim), `slug_hint` (short ASCII kebab-case topic summary; use pinyin or English for non-Latin topics) |
| `clarified` | Clarification answered, or nothing needed clarifying | — |
| `plan_confirmed` | The user chose the start option in `ask_user` | `study_type`, `framework`, `decision`, `hypotheses` (`[{statement, support_criteria, refute_criteria}]` in plan order; ids `H1`, `H2`, ... are assigned), `quota` (`[{segment, criteria, count}]`; counts add up to the persona count, at most 12), `interview_rounds` (default 5, at most 7), `guide_review` (`[{issue, before, after}]`, `issue` is `leading`, `double_barreled`, `hypothesis_reveal`, or `jargon`; `[]` when nothing changed) |
| `desk_research_done` | `desk-research.md` is written | — |
| `desk_research_skipped` | A `panel_only` study skips desk research | — |
| `interviews_finished` | `check_interviews` shows no unfinished transcript | — (the tool marks the interview phase failed when no interview succeeded) |
| `report_written` | `synthesis.json` and `report.html` are written | — |
| `questionnaire_written` | `validation-questionnaire.md` and `.csv` are written | — |
| `validation_compared` | Real-person answers were compared | `validated_count`, `validations` (`[{hypothesis_id, verdict: agree, partial, or disagree, summary}]`) |

`created` returns the new directory in `result.data["study_dir"]`; use it for every later call.

```python
created = tool.call("update_study", {
    "event": "created",
    "title": "<short title in the user's language>",
    "question": "<the user's question, verbatim>",
    "slug_hint": "trial-churn-week-two",
})
print(created.content)
study_dir = created.data["study_dir"]
```

## save_personas

Saves the study's personas and `studies/<slug>/panel.json` in one call, in interview order. Call it in the `interview` phase, after `desk_research_done` or `desk_research_skipped`.

- New persona: leave `id` empty and give `id_hint` (short ASCII, for example `zhangwei`), `name`, `tagline`, `tags`, all 7 `dimensions`, all 4 `layers`, `evidence` (`[{id: "e1", type, platform, title, url, file, quote}]`; `platform` only for `social`), `field_sources` for all 7 dimensions (evidence ids or `"inferred"`), and `consistency_notes`. The tool creates the id, fills `schema_version`, `created_in`, and `updated_at`, and computes `tier` by rule.
- Reused persona: give its `id`. Identity and content fields stay unchanged; you may add new `evidence` (new ids), missing `field_sources`, and `consistency_notes`.
- Every persona also needs `segment` (a quota segment) and `reason`. Set `from_uploaded_people: true` only for personas built from uploaded materials about real people.
- `panel_name` and `criteria` describe the group. Set `library_panel_name` only when the user asked to save the group to the library.

```python
result = tool.call("save_personas", {
    "study_dir": study_dir,
    "panel_name": "<panel name>",
    "criteria": "<how members were selected>",
    "personas": [
        {"id": "p_zhangwei_7f3a", "segment": "<quota segment>", "reason": "<why>"},
        {
            "id_hint": "liumin", "segment": "<quota segment>", "reason": "<why>",
            "name": "<name>", "tagline": "<one line>", "tags": ["<tag>"],
            "dimensions": {"demographics": {}, "geography": {}, "psychographics": {}, "behavior": {},
                           "needs_pains": [], "tech_adoption": "", "social": ""},
            "layers": {"expression": [], "story": "",
                       "cognition": {"decision_weights": [{"factor": "<factor>", "level": "high"}]},
                       "behavior": []},
            "evidence": [{"id": "e1", "type": "web", "title": "<title>", "url": "<url>", "quote": "<short quote>"}],
            "field_sources": {"demographics": "inferred", "geography": "inferred", "psychographics": "inferred",
                              "behavior": ["e1"], "needs_pains": ["e1"], "tech_adoption": "inferred", "social": "inferred"},
            "consistency_notes": [],
        },
    ],
})
print(result.content)
```

The content lists each persona id; use `personas/<persona_id>.json` in the interviewer briefs.

## check_interviews

Read-only. Lists every panel persona with its transcript status (`not_started`, `running`, `done`, `failed`), recorded rounds, and the round to continue from, plus focus groups and the effective sample. Call it after `wait_for_subagents`, and again after any interruption, before deciding what to re-dispatch.

```python
print(tool.call("check_interviews", {"study_dir": study_dir}).content)
```

## save_study_synthesis

Writes `synthesis.json` and the hypothesis verdicts in `study.json` together. Call it in the `report` phase after reading the completed transcripts. Give only judgments and exact words:

- `segments`: `[{name, persona_ids}]`, names equal to quota segments. Ids are assigned.
- `themes`: `[{name, description, stance_by_persona, quotes, source_refs, hypothesis_ids, confidence, confidence_reason}]`. `quotes` are `[{persona_id, text}]` with the persona's exact words; the tool finds the transcript file and `round_index`. Personas you leave out of `stance_by_persona` become `not_mentioned`.
- `dimensions` (optional): `[{name, level_by_segment, quotes}]`, `level_by_segment` keyed by segment name.
- `hypotheses`: `[{id, verdict, verdict_reason, quotes, source_refs}]` for every examined hypothesis.

The tool drops quotes that are not that persona's exact words and source refs that are not in `desk-research.md`, lowers confidence and verdicts that break the rules in methods.md (and says why in the reason fields), and computes saturation. Read `result.content`: report the removed quote count and any adjustments in the report, and use the adjusted verdicts and confidence.

```python
result = tool.call("save_study_synthesis", {
    "study_dir": study_dir,
    "segments": [{"name": "<quota segment>", "persona_ids": ["p_zhangwei_7f3a"]}],
    "themes": [{
        "name": "<theme in the user's words>",
        "stance_by_persona": {"p_zhangwei_7f3a": "support", "p_liumin_0b9e": "oppose"},
        "quotes": [{"persona_id": "p_zhangwei_7f3a", "text": "<exact words>"}],
        "source_refs": ["S3"], "hypothesis_ids": ["H1"],
        "confidence": "medium", "confidence_reason": "<rule that applied>",
    }],
    "hypotheses": [{
        "id": "H1", "verdict": "supported", "verdict_reason": "<one or two sentences>",
        "quotes": [{"persona_id": "p_zhangwei_7f3a", "text": "<exact words>"}], "source_refs": ["S3"],
    }],
})
print(result.content)
```

## save_validation_questionnaire

Writes `validation-questionnaire.csv` for survey tools. Write `validation-questionnaire.md` yourself first; then pass the same questions: screening questions (`S1`, `S2`, ..., no `hypothesis_id`) followed by guide questions (`Q1`, `Q2`, ..., each with its `hypothesis_id`). `type` is `single_choice`, `multiple_choice`, or `open`; choice questions need at least 2 `options`, open questions none.

```python
result = tool.call("save_validation_questionnaire", {
    "study_dir": study_dir,
    "questions": [
        {"id": "S1", "question": "<screening question>", "type": "single_choice", "options": ["<a>", "<b>"]},
        {"id": "Q1", "question": "<guide question>", "type": "open", "hypothesis_id": "H1"},
    ],
})
print(result.content)
```

## Interviewer Tools

Interviewer sub-agents record rounds with `persona_chat` (`transcript_path` plus `round_number`) and close each transcript with `finish_persona_transcript`. For a follow-up you run yourself ("Ask @persona ..."), call `persona_chat` the same way with the next `round_number`, then `finish_persona_transcript` again; the transcript reopens automatically when a finished one gets a new round.
