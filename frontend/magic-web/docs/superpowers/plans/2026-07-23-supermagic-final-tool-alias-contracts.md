# SuperMagic Final Tool And Alias Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development while implementing each task. This plan is executed in the current checkout because the target Store and tests already contain uncommitted user changes that must be preserved; do not create a worktree, stage, or commit.

**Goal:** Align SuperMagic Final reconciliation and Assistant alias convergence with the confirmed TC-03, TC-07, and D5 contracts.

**Architecture:** Keep the existing Store structure. Normalize Final tool calls at the existing reconciliation boundary, preserve nested streamed arguments only when the Final field is absent, and scope correlation aliases to Assistant messages. Tests remain black-box through public Store APIs and observable UI projection helpers.

**Tech Stack:** TypeScript, MobX, Vitest, React message projection.

---

### Task 1: Synchronize the late-Final identity test with D5/D6

**Files:**
- Modify: `src/pages/superMagic/stores/__tests__/chunk-transport-ordering.test.ts`

- [ ] Change the late-Final assertion so `store.messages` retains the Final `app_message_id`, while the logical card remains correlation-scoped.
- [ ] Run the single test and confirm the old correlation-as-app-id assertion no longer fails.

Run:

```bash
corepack pnpm exec vitest run --config ./vitest.config.ts \
  src/pages/superMagic/stores/__tests__/chunk-transport-ordering.test.ts \
  -t 'finish chunk 已清理 StreamState 后，迟到的完整 final message 权威覆盖全部流式字段。'
```

Expected: one passing test.

### Task 2: Preserve streamed arguments when Final nested arguments are absent

**Files:**
- Modify: `src/pages/superMagic/stores/__tests__/final-assistant-message.test.ts`
- Modify: `src/pages/superMagic/stores/index.ts`

- [ ] Keep the existing TC-03 test as the RED contract and add a late-Final-after-StreamState-cleanup variant.
- [ ] Run both tests and confirm the canonical arguments become empty before implementation.
- [ ] Update `reconcileFinalToolCalls()` so only an absent/undefined nested `function.arguments` inherits a matched current tool's string arguments; explicit values remain authoritative.
- [ ] Pass rendered canonical tools into late-Final reconciliation instead of reconciling against an empty array.
- [ ] Verify refresh/HTTP with no streamed arguments does not manufacture arguments.

Expected merge rule:

```ts
const hasFinalArguments =
  finalTool.function != null &&
  Object.prototype.hasOwnProperty.call(finalTool.function, "arguments") &&
  finalTool.function.arguments !== undefined

arguments: hasFinalArguments
  ? typeof finalTool.function?.arguments === "string"
    ? finalTool.function.arguments
    : ""
  : typeof existing?.function?.arguments === "string"
    ? existing.function.arguments
    : ""
```

### Task 3: Normalize duplicate Final tool ids with last-write-wins

**Files:**
- Modify: `src/pages/superMagic/stores/__tests__/final-assistant-message.test.ts`
- Modify: `src/pages/superMagic/stores/index.ts`

- [ ] Update the duplicate-id test to assert stable first-seen id order, last payload wins, one canonical/UI tool, and a structured warning rather than a fixed legacy error string.
- [ ] Run the test and confirm the Store currently returns both duplicate entries.
- [ ] Deduplicate projectable Final tools by id before reconciliation. Preserve first-seen id order while replacing its value with the last occurrence.
- [ ] Emit a structured warning containing the tool id and duplicate index.
- [ ] Verify the surviving tool is reindexed from zero at the canonical projection boundary.

### Task 4: Scope correlation aliases to Assistant messages

**Files:**
- Modify: `src/pages/superMagic/stores/__tests__/tool-response-execution-state.test.ts`
- Modify: `src/pages/superMagic/stores/__tests__/topic-correlation-message-identity.test.ts` if the existing identity fixtures are reusable
- Modify: `src/pages/superMagic/stores/index.ts`

- [ ] Keep the response-before-Final test as a RED raw-identity regression while retaining separate Map/embedded/effective assertions.
- [ ] Add coverage that a User or Tool sharing the correlation keeps its own `app_message_id` and node.
- [ ] Add a defensive no-Assistant-target test that preserves the correlation node and observes a structured warning.
- [ ] Restrict `completeStreamRendering()` and `settleTopicStreamsInstantly()` target lookup and alias writes to `role === "assistant"`.
- [ ] Never alias an Assistant snapshot under a Tool/User app id.

Expected target rule:

```ts
const assistantTarget = messages.find(
  (message) =>
    message.role === "assistant" &&
    (message.correlation_id === correlationId || message.app_message_id === correlationId),
)
```

### Task 5: Update the living contract record and verify

**Files:**
- Modify: `src/pages/superMagic/stores/tests.md`

- [ ] Mark TC-03 and TC-07 as decided, recording nested absent inheritance and last-write-wins.
- [ ] Record the Assistant-only correlation alias domain and structured warning fallback.
- [ ] Update focused test counts and failure status from the final run.
- [ ] Confirm no enterprise Store overlay exists.
- [ ] Run focused Vitest files, target ESLint, Prettier check, and `git diff --check` without staging or committing.

Run:

```bash
corepack pnpm exec vitest run --config ./vitest.config.ts \
  src/pages/superMagic/stores/__tests__/chunk-transport-ordering.test.ts \
  src/pages/superMagic/stores/__tests__/final-assistant-message.test.ts \
  src/pages/superMagic/stores/__tests__/tool-response-execution-state.test.ts \
  src/pages/superMagic/stores/__tests__/topic-correlation-message-identity.test.ts
```

