# Persona Research Methods

## Study Types

Pick one `study_type` in the plan. Types set the default mix of methods; you may combine methods when the question needs it.

| `study_type` | Use when | Default method mix | Typical frameworks |
|---|---|---|---|
| `user_research` | Understanding needs, motives, pain points, or churn of a known audience | Desk research + one-on-one interviews; optional focus group to test disagreement | JTBD, user journey |
| `product_rnd` | Deciding what to build or improve: feature priority, requirements, product-market fit | Desk research (competitors, reviews) + interviews probing current workarounds | KANO, JTBD |
| `concept_test` | Reacting to a specific concept, message, package, or price | Short desk research + interviews presenting the concept + focus group comparing variants | KANO, STP |
| `fast_insight` | A quick directional read on a narrow question | Light desk research + 3-5 personas with 3 rounds each; no focus group | any one framework |
| `panel_only` | Interviewing an existing persona panel without new desk research | Reuse panel personas; skip desk research (mark `desk_research=skipped`) | as the question requires |

## Frameworks

- JTBD (Jobs to Be Done): identify the job the person hires a product for, in the form "When <situation>, I want to <motivation>, so I can <outcome>". Probe the trigger, the current solution and its workarounds, anxieties about switching, and the habits that keep the old solution.
- KANO: classify features as must-be, performance, attractive, indifferent, or reverse. Ask paired questions: "How would you feel if the product had X?" and "How would you feel if it did not?" Report the classification per segment, not one global answer.
- STP (Segmentation, Targeting, Positioning): segment by needs and behavior rather than demographics alone, assess segment attractiveness and fit, then test positioning statements with each target segment.
- User journey: map stages (aware, consider, try, adopt, renew or churn), the actions, touchpoints, emotions, and pain points at each stage, and the moments that decide progress or drop-off.

## Hypotheses

- Write 3-5 hypotheses that the decision depends on. Each is one falsifiable sentence with `support_criteria` and `refute_criteria` stated as observable answers or source findings, not as feelings.
- [Good] "Owners' biggest pain is unrecorded verbal agreements, not meeting notes." Support: most participants describe a specific dispute over an unrecorded deal. Refute: most only mention meeting notes.
- [Bad] "Owners like AI tools." It cannot be refuted and does not inform a decision.

## Sample Quota and Anti-Homogenization

- Build the quota from demographic, situational, and behavioral variables only: industry, company size, city tier, role, usage stage (current user, churned, never used), current workaround. Never stratify on the outcome being tested (willingness to pay, price sensitivity, intent to switch).
- At least 25% of the panel are non-users, skeptics, or churned users (2 of 8, 3 of 12). Spread them across segments.
- Each `quota[]` row names the segment, the selection criteria including the usage stage mix, and the count; counts add up to the persona limit.
- Within a segment, vary behavior and circumstances (budget, staff size, who decides, current tools), not only names and ages.
- Keep contradictions inside a persona (`consistency_notes`) instead of smoothing them out; real people are inconsistent.

## Interview Guide

- 5-8 core questions ordered from broad to specific: context and recent behavior, then the problem, current solutions, reactions to the concept or idea, and finally price or switching.
- Open questions only; never ask two things in one question.
- Do not reveal the hypothesis before the participant has described their own behavior.
- Include at least one negative question: "In what situation would you not use this, or give up on it?"
- Use the participant's everyday words instead of research or industry jargon.
- Leave room for follow-up probes within the round limit; the guide is not a script to read verbatim.

### Guide Self-Check

Before showing the plan, check every guide question against this list, rewrite the ones that fail, and record each change in `plan.md` ("Guide self-check") and `study.json` `guide_review.items`.

| `issue` | Fails when | Before | After |
|---|---|---|---|
| `leading` | The question suggests the expected answer | "Don't you find keeping records a hassle?" | "The last time a deal was not written down, what happened next?" |
| `double_barreled` | One question asks two things | "How do you choose and pay for software?" | "How did you choose the last tool you bought?" (ask about paying separately) |
| `hypothesis_reveal` | The question states the hypothesis before the participant describes their behavior | "Would a recorder that stops customers backing out of deals help you?" | "Tell me about a deal where the customer later remembered it differently." |
| `jargon` | The question uses terms the audience does not use | "How do you manage your private-domain retention?" | "How do you get past customers to come back?" |

## Interview Techniques

- Five whys: on a key answer, ask "why" (in natural variations) until the answer reaches a motive, value, or constraint rather than a surface reason. Usually 2-4 steps are enough.
- Scenario simulation: ground answers in a concrete situation, either the most recent real one ("Walk me through the last time...") or a hypothetical one ("Suppose tomorrow your supplier offers... what do you do first?").
- Contrast probing: ask the participant to compare two options, brands, prices, or past and present behavior, and to explain what made the difference.
- Behavior over opinion: when an answer is a general opinion ("I like convenience"), ask for an example of what they actually did.
- Neutral follow-ups: repeat the participant's own words ("You said it felt risky — risky how?") instead of adding your interpretation.

## Focus Group Moderation

- 3-6 participants with deliberately different attitudes on the topic, including at least one skeptic.
- Open with a round where everyone answers the same warm-up question so every participant speaks.
- Rotate the speaking order every round (pass `persona_paths` in a different order) so the same person does not always set the tone.
- When opinions diverge, ask each side to respond directly to the other's point.
- If a participant keeps agreeing with others, probe them alone on their own experience.
- Do not take sides, summarize a consensus that did not happen, or let one participant dominate several rounds in a row.
- Record disagreements explicitly in `key_findings`.

## Synthesis

Write `synthesis.json` first, then the report from it. Each step below is required.

### Theme Coding

1. Read every completed transcript (`status=done`) in `panel.json` `persona_ids` order, then the focus groups.
2. For each transcript, list the distinct ideas the persona expressed in their own answers. Ignore what the moderator said.
3. Merge ideas with the same meaning into themes across transcripts; name each theme in the user's words, not a framework label.
4. For each theme, set the stance of every interviewed persona: `support` (they affirm it with their own experience), `oppose` (they contradict it), `mixed` (both), `not_mentioned`.
5. Attach 1-3 `quote_refs` per theme, link `source_refs` and `hypothesis_ids`, then apply the confidence rules.
6. Use `dimensions` only for factors compared across segments (for example purchase considerations); levels are `high`, `medium`, or `low`, never numbers.

### Saturation

- `new_themes_per_interview` has one integer per completed one-on-one interview, in `panel.json` `persona_ids` order: the number of themes that first appear in that interview. Focus groups are not counted.
- `saturated` is `true` only when the last 2 entries are both `0`. Otherwise the report recommends a larger sample.

### Downweighting

- Interviews with `quality.inferred_ratio` of 0.4 or more are downweighted: do not count them toward "most" in verdicts or confidence, do not use them as the lead quote for a claim, and mention the downweight in `confidence_reason` when it changes the result. If `quality` is missing, estimate the ratio by counting the persona's sentences that contain `(inferred)`.

### Hypothesis Verdict Rules

"External source" means a desk-research source or persona evidence of type `web`, `social`, or `upload`. AI interviews are never an external source.

| `verdict` | When |
|---|---|
| `pending` | Before the report phase, or the hypothesis was not examined |
| `supported` | The support criteria are met in most relevant completed interviews, at least one external source agrees, and no external source contradicts it |
| `refuted` | The refute criteria are met in most relevant completed interviews and at least one external source agrees |
| `mixed` | Evidence splits across segments, interviews and sources disagree, or the AI-only cap below applies |
| `insufficient` | Fewer than 3 completed interviews address it and no external source covers it |

AI-only cap: when the only evidence for supporting or refuting a hypothesis comes from AI interviews, the verdict is at most `mixed`, and `verdict_reason` starts with "Pending real-person validation" (in the user's language). Real-person results go into `validation`; they do not overwrite `verdict`.

### Theme Confidence Rules

| `confidence` | When |
|---|---|
| `high` | Real-person validation agrees, or at least 2 external sources agree and the relevant interviews are consistent |
| `medium` | 1 external source agrees and the relevant interviews are mostly consistent |
| `low` | External sources and interviews conflict, or the support rests mainly on downweighted interviews |
| `to_validate` | Supported by AI interviews only, however many personas agree |

### Quote Self-Check

Before writing the report, verify every `quote_refs` item in `synthesis.json` and every `quote` item in `study.json` `evidence_refs`: the `text` must appear verbatim in `rounds[round_index].text` of the referenced transcript, and that round must be spoken by the persona. Run the check in code with `run_sdk_snippet`, remove each mismatch from both files, and note the removed count in the report's limitations.

```python
import json
from pathlib import Path

study = Path("studies/<slug>")
syn = json.loads((study / "synthesis.json").read_text(encoding="utf-8"))
meta = json.loads((study / "study.json").read_text(encoding="utf-8"))

def ok(ref, default_file):
    try:
        path = study / (ref.get("file") or default_file)
        turn = json.loads(path.read_text(encoding="utf-8"))["rounds"][ref["round_index"]]
        speaker = turn.get("speaker") or turn.get("role")
        return speaker in ("persona", ref["persona_id"]) and ref["text"] in turn.get("text", "")
    except (OSError, ValueError, KeyError, IndexError, TypeError, AttributeError):
        return False

removed = []
for item in syn.get("themes", []) + syn.get("dimensions", []):
    kept = [r for r in item.get("quote_refs", []) if ok(r, "")]
    removed += [r.get("text") for r in item.get("quote_refs", []) if r not in kept]
    item["quote_refs"] = kept
for hyp in meta.get("hypotheses", []):
    refs = hyp.get("evidence_refs", [])
    kept = [r for r in refs if r.get("kind") != "quote" or ok(r, f"interviews/{r.get('persona_id')}.json")]
    removed += [r.get("text") for r in refs if r not in kept]
    hyp["evidence_refs"] = kept
(study / "synthesis.json").write_text(json.dumps(syn, ensure_ascii=False, indent=2), encoding="utf-8")
(study / "study.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Removed {len(removed)} unverifiable quotes:", removed)
```

### Writing Findings

- Do not write counts or ratios of personas ("5 of 8", "62%"). Use "most", "some", or "a few", and state once that AI-simulated samples do not support statistical inference.
- Group findings by theme, and show segment differences inside each theme; a theme raised by one persona only is a signal, not a pattern.
- Each claim cites its evidence: interview quotes (persona name + transcript file) and web sources `[S#]`. Mark claims supported only by your inference as such.
- Report counter-evidence and minority views next to the main finding.
- Every finding and recommendation shows an evidence bar: web sources N, AI interviews N people, real-person validation not done / done (N people).
- State the effective sample size (completed interviews) and that participants are AI-simulated personas.

### Business Recommendations

Cover, in this order: target segment priority, a one-line positioning, pricing direction, channels and reach, and first-30-day actions. Each item lists its hypothesis ids, its evidence, and what to validate first.

Pricing warning: AI respondents are systematically optimistic about price and willingness to pay. Give only a direction and a range, never a single price point, and always state that the numbers cannot be used to set a price without real-person validation.
