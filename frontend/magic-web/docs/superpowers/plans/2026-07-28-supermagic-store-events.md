# SuperMagic Store Typed Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Store-owned topic/domain listener registries with a typed six-event subscription API while preserving current canonical message, stream, tool-response, recovery, and UI behavior.

**Architecture:** Add a Store-local typed event emitter whose public surface is `subscribe(type, callback, options?)`. Keep transport recovery and collaborator callbacks separate. Publish compact immutable event snapshots only after canonical state mutations, use a transition ledger for stream generations and entity revisions, keep cold history hydration silent unless it reconciles active local state, and move Crew/task/read-progress decisions to consumers outside the Store.

**Tech Stack:** TypeScript, MobX, React 18, Vitest.

---

### Task 1: Record the clean baseline

**Files:**

- Inspect: `src/pages/superMagic/stores/index.ts`
- Test: `src/pages/superMagic/stores/__tests__/`

- [ ] Run `git status --short`; expect no output.
- [ ] Run the complete Store test directory with `corepack pnpm exec vitest run --config ./vitest.config.ts src/pages/superMagic/stores/__tests__`.
- [ ] Record any pre-existing failures before adding event tests.
- [ ] Do not stage, commit, or create a second worktree.

### Task 2: Define the public event contracts and emitter behavior with RED tests

**Files:**

- Create: `src/pages/superMagic/stores/events/contracts/message-stream-started.ts`
- Create: `src/pages/superMagic/stores/events/contracts/message-stream-delta.ts`
- Create: `src/pages/superMagic/stores/events/contracts/message-stream-ended.ts`
- Create: `src/pages/superMagic/stores/events/contracts/message-committed.ts`
- Create: `src/pages/superMagic/stores/events/contracts/message-completed.ts`
- Create: `src/pages/superMagic/stores/events/contracts/tool-call-settled.ts`
- Create: `src/pages/superMagic/stores/events/common.ts`
- Create: `src/pages/superMagic/stores/events/event-map.ts`
- Create: `src/pages/superMagic/stores/events/subscribe.ts`
- Create: `src/pages/superMagic/stores/events/internal/emitter.ts`
- Create: `src/pages/superMagic/stores/events/internal/transition-ledger.ts`
- Create: `src/pages/superMagic/stores/events/index.ts`
- Test: `src/pages/superMagic/stores/events/__tests__/emitter.test.ts`

- [ ] Write emitter tests first for typed registration, scope filtering, predicate filtering, independent duplicate registrations, idempotent cleanup, AbortSignal cleanup, FIFO delivery, and listener exception isolation.
- [ ] Run the emitter test and verify RED because the event module does not exist.
- [ ] Define common event metadata with documented `sequence`, per-entity `revision`, source, topic/message identities, and stream generation.
- [ ] Put exactly one of the six public event contracts in each contract file. Add a field-level comment to every property; add a separate explanatory comment for every calculated or mapped property.
- [ ] Define the map exactly as:

```ts
export interface SuperMagicEventMap {
	"message.stream.started": MessageStreamStartedEvent
	"message.stream.delta": MessageStreamDeltaEvent
	"message.stream.ended": MessageStreamEndedEvent
	"message.committed": MessageCommittedEvent
	"message.completed": MessageCompletedEvent
	"toolCall.settled": ToolCallSettledEvent
}
```

- [ ] Define `subscribe<T extends SuperMagicEventType>(type, callback, options?): () => void` with topic/correlation/app-message/tool-call scope, predicate, and AbortSignal support; do not add replay.
- [ ] Implement the minimal emitter and transition ledger required by the tests.
- [ ] Run the emitter test and verify GREEN.

### Task 3: Lock the six Store lifecycle contracts with RED integration tests

**Files:**

- Create: `src/pages/superMagic/stores/__tests__/store-events.test.ts`
- Reuse fixtures from: `src/pages/superMagic/stores/__tests__/chunk-transport-ordering.test.ts`
- Reuse fixtures from: `src/pages/superMagic/stores/__tests__/final-assistant-message.test.ts`
- Reuse fixtures from: `src/pages/superMagic/stores/__tests__/tool-response-execution-state.test.ts`

- [ ] Write a RED test proving the first accepted ordered metadata-only chunk emits `message.stream.started` once and does not emit delta.
- [ ] Write a RED test proving a canonical content chunk emits started then delta, while duplicate chunks and render ticks emit nothing.
- [ ] Write a RED test proving same-correlation `i=0` restart emits ended for the old generation and started for the incremented generation.
- [ ] Write a RED test proving a final chunk with content emits delta before `message.stream.ended`, with `awaitingCanonicalMessage: true`.
- [ ] Write a RED test proving a canonical Assistant Final emits `message.committed` and then `message.completed`, while the prior stream is ended first when necessary.
- [ ] Write a RED test proving cold HTTP history hydration emits no lifecycle events, but an HTTP snapshot that settles an active stream emits the corresponding transition events.
- [ ] Write a RED test proving a same-terminal higher-seq revision emits committed but not completed, while a terminal-status change emits completed again.
- [ ] Write a RED test proving revoked closes the stream and emits completed with terminal status `revoked`.
- [ ] Write a RED test proving `response_missing` emits weak replaceable `toolCall.settled`, and a late real response emits a second strong settlement.
- [ ] Write a RED test proving `ask_user` does not emit a synthetic settled event.
- [ ] Run only `store-events.test.ts` and verify failures are caused by the missing Store subscription API and missing event publication.

### Task 4: Integrate event publication into canonical Store transitions

**Files:**

- Modify: `src/pages/superMagic/stores/index.ts`
- Modify: `src/pages/superMagic/stores/types.ts`
- Test: `src/pages/superMagic/stores/__tests__/store-events.test.ts`

- [ ] Add a private typed emitter and transition ledger to each `SuperMagicStore` instance; exclude both from MobX observation.
- [ ] Add the public generic `subscribe()` method and no event-specific public methods.
- [ ] Emit stream started when the first valid ordered chunk advances a new generation, including metadata/usage-only chunks.
- [ ] Emit stream delta only for accepted canonical content/reasoning/tool changes; publish fragment lengths and normalized tool-call fragments, never full accumulated arguments or attachments.
- [ ] Emit stream ended for finish reason, authoritative Final, restart, suspended, revoked, or recovery replacement. Never emit it from typewriter completion alone.
- [ ] Emit message committed only after a semantic canonical message mutation. Exclude provisional correlation cards and typewriter ticks.
- [ ] Emit message completed only for Assistant terminal transitions. Suppress repeated completion for a higher-seq revision with the same terminal status.
- [ ] Keep cold HTTP/shared hydration silent. Emit only when hydration updates existing canonical state or settles an active local stream.
- [ ] Emit tool-call settled after canonical `toolResponseMap` changes from unresolved to strong or weak terminal. Preserve `response_missing` as weak/replaceable and exclude `ask_user` synthetic settlement.
- [ ] Apply all state mutations for a transaction before publishing its ordered events: stream ended, message committed, tool settlements, message completed.
- [ ] Run `store-events.test.ts` and verify GREEN.

### Task 5: Migrate production consumers and remove Store-owned business resolvers

**Files:**

- Modify: `src/pages/superMagic/pages/TopicPage/index.desktop.tsx`
- Modify: `src/pages/superMagic/hooks/useScopedTopicReadProgress.ts`
- Modify: `src/pages/superMagic/hooks/useRefreshTopicDetailOnTaskComplete.ts`
- Modify: `src/pages/superMagic/hooks/useFileData.ts`
- Modify: `src/pages/superMagic/pages/CrewEdit/hooks/useRefreshCrewDetailOnTopicMessage.ts`
- Delete: `src/pages/superMagic/stores/listener-registry/README.md`
- Delete: `src/pages/superMagic/stores/listener-registry/*.ts`
- Modify: relevant Hook tests and Store tests that import old listener payload types.

- [ ] Migrate read-progress consumers to `message.committed` and use the normalized message reference.
- [ ] Migrate topic/file task refresh consumers to `message.completed`, scoped by topic and filtered to the approved terminal statuses.
- [ ] Migrate Crew refresh to `toolCall.settled`; filter strong completed `update_agent`/`update_skill` results and resolve the crew code from response detail outside the Store.
- [ ] Replace test arrival collectors with typed `message.committed` or `message.completed` collectors according to the assertion's observation layer.
- [ ] Remove Store imports, methods, and types for topic/domain listener registries.
- [ ] Delete `listener-registry` after `rg` confirms there are no remaining imports or registrations.
- [ ] Run affected Hook and Store suites and verify GREEN.

### Task 6: Verify performance, enterprise symmetry, and repository quality gates

**Files:**

- Inspect: `enterprise/src/pages/superMagic/`
- Verify: all changed files

- [ ] Confirm no enterprise Store/event counterpart requires a mirrored change.
- [ ] Run the full Store test directory.
- [ ] Run focused Hook tests for topic messages and scoped read progress.
- [ ] Run `corepack pnpm lint` if repository lint infrastructure is available; otherwise report the exact blocker.
- [ ] Run Prettier check/fix only on touched files using the repository formatter.
- [ ] Run `git diff --check`.
- [ ] Run `git status --short` and report the exact unstaged file set.
- [ ] Do not stage, commit, push, or open a pull request.
