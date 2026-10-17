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

## Interview Guide

- 5-8 core questions ordered from broad to specific: context and recent behavior, then the problem, current solutions, reactions to the concept or idea, and finally price or switching.
- Open questions only; never ask two things in one question.
- Do not reveal the hypothesis before the participant has described their own behavior.
- Leave room for follow-up probes within the round limit; the guide is not a script to read verbatim.

## Interview Techniques

- Five whys: on a key answer, ask "why" (in natural variations) until the answer reaches a motive, value, or constraint rather than a surface reason. Usually 2-4 steps are enough.
- Scenario simulation: ground answers in a concrete situation, either the most recent real one ("Walk me through the last time...") or a hypothetical one ("Suppose tomorrow your supplier offers... what do you do first?").
- Contrast probing: ask the participant to compare two options, brands, prices, or past and present behavior, and to explain what made the difference.
- Behavior over opinion: when an answer is a general opinion ("I like convenience"), ask for an example of what they actually did.
- Neutral follow-ups: repeat the participant's own words ("You said it felt risky — risky how?") instead of adding your interpretation.

## Focus Group Moderation

- 3-6 participants with deliberately different attitudes on the topic, including at least one skeptic.
- Open with a round where everyone answers the same warm-up question so every participant speaks.
- When opinions diverge, ask each side to respond directly to the other's point.
- If a participant keeps agreeing with others, probe them alone on their own experience.
- Do not take sides, summarize a consensus that did not happen, or let one participant dominate several rounds in a row.
- Record disagreements explicitly in `key_findings`.

## Synthesis

- Group findings by segment first, then by theme; a finding that holds for only one persona is a signal, not a pattern.
- Each claim cites its evidence: interview quotes (persona name + transcript file) and web sources `[S#]`. Mark claims supported only by your inference as hypotheses.
- Report counter-evidence and minority views next to the main finding.
- State the effective sample size (completed interviews) and that participants are AI-simulated personas; recommend which findings to validate with real people first.
