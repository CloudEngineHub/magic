# After-run memory maintenance

These rules govern memory maintenance after a source conversation. The runtime's task message identifies the current maintenance task, permitted scopes, and any initially over-budget cores. It also supplies the full memory SKILL.md again for this task, with the shared retrieval, storage, and preservation rules. Use these supplied instructions directly; no tool call is needed to reload them.

## Sources and evidence

- Candidate memories come from the source conversation actually available in the fork. Prioritize explicit remember/correct/forget requests, repeated corrections, confirmed decisions and reasons, meaningful developments in ongoing project work, reusable lessons, and writes the main Agent missed. The maintenance request and internal runtime instructions are not candidate memories. Do not assume compressed-away messages or main-Agent-only tools are available.
- The supplied source project and topic identify the captured conversation, not the background Agent's run. Preserve any different origin already attached to quoted or existing memories; reading or reorganizing them does not make this conversation their source. Missing source details are not a reason to invent them or stop otherwise valid maintenance.
- Existing memory content and successful write results establish what is already saved. A promise is not a saved memory; a successful but vague entry may still lack important conditions. Read uncertain targets using the main skill's retrieval rules.

## Necessary updates

- Missing useful information requires a saved addition; an incomplete entry needs its missing conditions and reasons; a confirmed correction or forget request must be reflected in the affected memory. Apply the main skill's placement and merge rules. Update the relevant work summary in MEMORY.md when the source conversation establishes a meaningful change, keeping other topics' still-relevant context intact. If frequently needed facts, rules, or details are saved only in notes, restore them to MEMORY.md with enough detail for routine work. If pointers to infrequently needed notes do not say when to read them, correct the reading instructions. Correctly placed, complete information needs no second write merely because wording could differ.
- A maintenance task does not resume the source business task or require a library-wide reorganization. No new information, missed write, correction, forget request, missing core context, unclear note pointers, or over-budget core means no write is necessary.

For Claw, maintain its own workspace memory under the inherited rules and claw_memory path. Apply the main skill's global/project scope rules: respect enabled/excluded state, do not create ordinary project memory or rewrite Claw's workspace-memory policy, and do not require a global copy merely because its workspace changed.

## Reorganization conditions

Evaluate each MEMORY.md separately using initial runtime usage and the latest writing-tool metrics. A core strictly above its maximum requires reorganization under references/reorganize.md. Use the reference already supplied, or read it from this same skill when an over-budget core is discovered during maintenance, including after a write. Another core being over budget does not justify reorganizing this one. A core at its maximum is allowed; the preferred target is neither a minimum nor a reorganization trigger.

## Completion

Maintenance is complete when intended updates are saved and no specific omission, failure, or conflict remains. There is no required extra reread, recount, or review Agent; retain the main skill's save-and-read-back check before shortening the only source of retained information. Do not impose a fixed number of tool rounds.

Report briefly what was saved, what needed no change, and unresolved items. A failed write, missing source evidence required for an intended update, or conflicting concurrent update means partial completion: keep completed changes and preserve unresolved source content. Do not claim a later run has already recovered it or store this operational report in MEMORY.md.
