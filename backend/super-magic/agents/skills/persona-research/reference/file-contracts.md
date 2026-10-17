# Persona Research File Contracts

The research workspace UI parses these files. A file whose required fields are missing or whose `schema_version` is not `1` is shown as "not ready", so write every required field exactly as specified. Unknown extra fields are ignored by the UI.

Rules for every file:

- `schema_version` is the number `1`.
- Field names and enum values are English and exactly as written below. Human-readable text (titles, summaries, answers) uses the user's language.
- Overwrite the whole file with `write_file`; do not leave partial JSON.
- Paths stored inside files are workspace-relative.
- Times use ISO 8601 with an explicit offset, for example `2026-10-18T14:20:00+08:00`.

## study.json

Path: `studies/<slug>/study.json`

| Field | Required | Values |
|---|---|---|
| `schema_version` | yes | `1` |
| `title` | yes | short study title |
| `question` | yes | the user's original question, verbatim |
| `study_type` | no | `user_research` \| `product_rnd` \| `concept_test` \| `fast_insight` \| `panel_only` |
| `framework` | no | list of framework names, for example `["JTBD"]` |
| `phase` | yes | `clarify` \| `plan` \| `desk_research` \| `interview` \| `report` \| `validation` \| `done` |
| `phases` | yes | all six phases in order, each `{ "key": <phase>, "status": "done" \| "running" \| "pending" \| "skipped" \| "failed" }` |
| `limits` | no | `{ "personas": <int>, "interview_rounds": <int> }` |
| `outputs` | no | `{ "plan": "plan.md", "report": "report.html", "validation": "validation-questionnaire.md" }`, paths relative to the study directory |

Example (interviews in progress):

```json
{
  "schema_version": 1,
  "title": "Why trial users churn in week two",
  "question": "Why do our trial users stop using the app in the second week?",
  "study_type": "user_research",
  "framework": ["JTBD"],
  "phase": "interview",
  "phases": [
    { "key": "clarify", "status": "done" },
    { "key": "plan", "status": "done" },
    { "key": "desk_research", "status": "done" },
    { "key": "interview", "status": "running" },
    { "key": "report", "status": "pending" },
    { "key": "validation", "status": "pending" }
  ],
  "limits": { "personas": 8, "interview_rounds": 5 },
  "outputs": { "plan": "plan.md", "report": "report.html", "validation": "validation-questionnaire.md" }
}
```

## personas/<persona_id>.json

Path: `personas/<persona_id>.json` (project-level library). `id` format: `p_<short-ascii-slug>_<4 random hex>`.

| Field | Required | Values |
|---|---|---|
| `schema_version` | yes | `1` |
| `id` | yes | same as the file name without `.json` |
| `name` | yes | display name |
| `tagline` | no | one-line description |
| `tags` | no | short labels |
| `tier` | yes | `generated` \| `evidence_based` \| `imported` |
| `dimensions` | no | `demographics` (object), `geography` (object), `psychographics` (object), `behavior` (object), `needs_pains` (array), `tech_adoption` (string), `social` (string) |
| `layers` | no | `expression` (array of typical phrasings), `story` (string, life and usage story), `cognition` (`{ "decision_weights": { <factor>: <weight> } }`), `behavior` (array of concrete actions) |
| `evidence` | no | array of `{ "id", "type": "web" \| "upload" \| "interview", "title", "url", "file", "quote" }` |
| `created_in` | no | `studies/<slug>` of the study that created it |
| `updated_at` | no | ISO 8601 time with offset |

Although `dimensions`, `layers`, and `evidence` are optional for the UI, every persona you create fills all 7 dimensions, all 4 layers, and at least one evidence item when sources exist.

Example:

```json
{
  "schema_version": 1,
  "id": "p_zhangwei_7f3a",
  "name": "Zhang Wei",
  "tagline": "Owner of a building-materials wholesale shop, 52",
  "tags": ["skeptical of AI", "relationship-driven"],
  "tier": "evidence_based",
  "dimensions": {
    "demographics": { "age": 52, "gender": "male", "education": "high school", "income": "upper-middle" },
    "geography": { "city_tier": "tier 3", "region": "East China" },
    "psychographics": { "values": ["reliability", "face"], "risk_attitude": "cautious" },
    "behavior": { "purchase_channel": "offline dealers", "device": "Android phone, rarely a laptop" },
    "needs_pains": ["Forgets details agreed on phone calls", "Distrusts tools his staff cannot use"],
    "tech_adoption": "Late majority: adopts only after peers prove value",
    "social": "Decisions influenced by long-time suppliers and his eldest son"
  },
  "layers": {
    "expression": ["Show me who else is using it.", "Is it complicated?"],
    "story": "Runs a family shop for 20 years; staff of 6; closes most deals on calls and WeChat voice messages.",
    "cognition": { "decision_weights": { "price": 0.3, "ease_of_use": 0.4, "peer_proof": 0.3 } },
    "behavior": ["Keeps a paper notebook of orders", "Asks his son to set up new apps"]
  },
  "evidence": [
    {
      "id": "e1",
      "type": "web",
      "title": "Survey of SME owners' digital tool adoption",
      "url": "https://example.com/sme-survey",
      "file": "",
      "quote": "Over half of owners cite staff training as the main barrier."
    }
  ],
  "created_in": "studies/ai-recorder-smb-owners-3f9a",
  "updated_at": "2026-10-18T14:20:00+08:00"
}
```

## panels/<panel_id>.json

Path: `panels/<panel_id>.json` (project-level saved group).

| Field | Required | Values |
|---|---|---|
| `schema_version` | yes | `1` |
| `id` | yes | same as the file name without `.json` |
| `name` | yes | display name |
| `persona_ids` | yes | list of persona ids |
| `criteria` | no | how members were selected |

Example:

```json
{
  "schema_version": 1,
  "id": "panel_smb_owners_2c41",
  "name": "SMB owners, tier 2-3 cities",
  "persona_ids": ["p_zhangwei_7f3a", "p_liumin_0b9e"],
  "criteria": "Owners of businesses with 5-50 staff who negotiate deals by phone"
}
```

## studies/<slug>/panel.json

The personas used in this study. Same fields as a panel file, plus `selection` recording why each persona was chosen and whether it was reused from the library.

| Field | Required | Values |
|---|---|---|
| `schema_version`, `id`, `name`, `persona_ids`, `criteria` | as in the panel file | |
| `selection` | no | array of `{ "persona_id", "reason", "reused": true \| false }` |

Example:

```json
{
  "schema_version": 1,
  "id": "panel_ai-recorder-smb-owners-3f9a",
  "name": "Study panel",
  "persona_ids": ["p_zhangwei_7f3a", "p_liumin_0b9e"],
  "criteria": "SMB owners who rely on phone calls to close deals",
  "selection": [
    { "persona_id": "p_zhangwei_7f3a", "reason": "Skeptical late adopter; tests the trust barrier", "reused": true },
    { "persona_id": "p_liumin_0b9e", "reason": "Efficiency-driven chain owner; tests the productivity pitch", "reused": false }
  ]
}
```

## studies/<slug>/interviews/<persona_id>.json

| Field | Required | Values |
|---|---|---|
| `schema_version` | yes | `1` |
| `persona_id` | yes | interviewed persona |
| `status` | yes | `done` \| `running` \| `failed` |
| `error` | no | reason when `status` is `failed`, otherwise `""` |
| `rounds` | yes | array of `{ "role": "moderator" \| "persona", "text" }` in speaking order |
| `summary` | no | short summary of the interview |
| `key_findings` | no | array of strings |
| `quotes` | no | array of `{ "text", "theme" }`; `text` is the persona's exact words from `rounds` |

Example:

```json
{
  "schema_version": 1,
  "persona_id": "p_zhangwei_7f3a",
  "status": "done",
  "error": "",
  "rounds": [
    { "role": "moderator", "text": "Tell me about the last time you lost track of what was agreed on a call." },
    { "role": "persona", "text": "Last month a contractor said we agreed on a lower price. I had no record, so I gave in." },
    { "role": "moderator", "text": "Why did you give in instead of checking?" },
    { "role": "persona", "text": "He has ordered from me for ten years. Arguing costs more than the discount." }
  ],
  "summary": "Values relationships over records; losses from verbal agreements are accepted as a cost of business.",
  "key_findings": ["Pain is real but tolerated", "Trust and peer proof matter more than features"],
  "quotes": [{ "text": "Arguing costs more than the discount.", "theme": "relationship over records" }]
}
```

## studies/<slug>/discussions/<discussion_id>.json

The same fields as an interview file without `persona_id`, plus `id` and `participants`. Each round uses `speaker` instead of `role`: `"moderator"` or a participant's `persona_id`.

| Field | Required | Values |
|---|---|---|
| `schema_version` | yes | `1` |
| `id` | no | same as the file name without `.json` |
| `participants` | yes | list of persona ids (3-6) |
| `status` | yes | `done` \| `running` \| `failed` |
| `error` | no | reason when `status` is `failed` |
| `rounds` | yes | array of `{ "speaker": "moderator" \| <persona_id>, "text" }` |
| `summary`, `key_findings`, `quotes` | no | as in the interview file |

Example:

```json
{
  "schema_version": 1,
  "id": "fg_pricing_9d20",
  "participants": ["p_zhangwei_7f3a", "p_liumin_0b9e", "p_chenjing_51ac"],
  "status": "done",
  "error": "",
  "rounds": [
    { "speaker": "moderator", "text": "Would you pay 299 a year for automatic call notes?" },
    { "speaker": "p_zhangwei_7f3a", "text": "Not before I see a friend using it." },
    { "speaker": "p_liumin_0b9e", "text": "299 is nothing if it saves my managers one hour a week." },
    { "speaker": "p_chenjing_51ac", "text": "I agree with Liu on value, but my staff will not record customers." }
  ],
  "summary": "Price is acceptable to efficiency-driven owners; trust and recording consent block others.",
  "key_findings": ["Disagreement: value vs. trust", "Recording consent is an unaddressed barrier"],
  "quotes": [{ "text": "Not before I see a friend using it.", "theme": "peer proof" }]
}
```
