# HTTP Authoritative Sync Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 18 confirmed HTTP authoritative-sync Store RED tests pass, close the production HTTP recovery flow, and preserve all black-box contracts and existing local changes.

**Architecture:** Keep the current Store shape and add narrowly scoped reconciliation helpers. Treat a complete HTTP list as an atomic topic snapshot, branch Assistant reconciliation by terminal status, add immutable identity/version gates before mutation, and centralize correlation-scoped recovery scheduling/budget/failure state. A module-level coordinator owns the single Store recovery listener while Hooks register topic/conversation owners and aggregate all HTTP pages before one generation-bound replace. Task terminal status remains independent from HTTP transport success.

**Tech Stack:** TypeScript, MobX, Vitest, fake timers.

---

### Task 1: Preserve the RED baseline and local changes

**Files:**

- Test: `src/pages/superMagic/stores/__tests__/http-authoritative-sync-recovery.test.ts`
- Inspect: `src/pages/superMagic/stores/index.ts`

- [x] Run the focused suite and confirm `49 tests / 31 passed / 18 failed` with assertion failures only.
- [x] Inspect staged and unstaged diffs before editing; preserve the existing tool-call reconciliation changes in `index.ts`.
- [x] After each implementation batch, rerun the affected focused tests before proceeding.

### Task 2: Implement atomic authoritative snapshot replacement and stable ordering

**Files:**

- Modify: `src/pages/superMagic/stores/index.ts`
- Modify: `src/pages/superMagic/stores/message-transforms.ts`
- Test: `src/pages/superMagic/stores/__tests__/http-authoritative-sync-recovery.test.ts`

- [x] Make `sortMessages()` compare numeric sequence strings and preserve original input order when sequence IDs are equal.
- [x] In `initializeMessages()`, build the committed topic list from the complete incoming identity set instead of mutating the previous list in place.
- [x] Preserve an existing higher-seq revision only when the same incoming logical identity is present; remove topic messages absent from the authoritative snapshot.
- [x] Treat a complete empty input as an empty authoritative snapshot while restoring only explicitly restorable optimistic user messages.
- [x] Remove stale topic-owned `messageMap` aliases/nodes after the replacement is committed.
- [x] Run focused cases for empty snapshot, stable order, and paginated replacement; expect them to pass.

### Task 3: Add identity gates and structured protocol warnings

**Files:**

- Modify: `src/pages/superMagic/stores/index.ts`
- Test: `src/pages/superMagic/stores/__tests__/http-authoritative-sync-recovery.test.ts`

- [x] Reject an Assistant record before any mutation when an existing `app_message_id` is bound to a different correlation.
- [x] Do not advance the message watermark, create aliases, update canonical nodes, or mutate tool state for a rejected identity conflict.
- [x] For equal-seq semantic payload conflicts, preserve the first canonical value and emit the confirmed `assistant-seq-conflict` warning payload.
- [x] When a Tool response lacks `tool.id`, preserve the raw message, skip canonical association, and emit `tool-response-missing-tool-id` once for that revision.
- [x] Run focused identity/warning cases and adjacent identity/tool-response suites.

### Task 4: Split terminal and nonterminal Assistant reconciliation

**Files:**

- Modify: `src/pages/superMagic/stores/index.ts`
- Test: `src/pages/superMagic/stores/__tests__/http-authoritative-sync-recovery.test.ts`

- [x] Detect terminal Assistant nodes from public node status before reconciliation.
- [x] Keep the existing terminal absent/null/empty semantics and final-array replacement.
- [x] For nonterminal content, preserve local content on absent/null/empty input; accept only meaningful non-empty incoming progress.
- [x] For nonterminal tools, merge by stable `tool.id`, preserve local-only tools, add incoming-only tools, and merge same-ID fields without replacing incomparable local arguments.
- [x] Do not clear StreamState, watchdog, snapshots, or public streaming state for a nonterminal snapshot.
- [x] Run all eight nonterminal cases and terminal presence regressions.

### Task 5: Centralize recovery in-flight state, budget, and failure observability

**Files:**

- Modify: `src/pages/superMagic/stores/types.ts`
- Modify: `src/pages/superMagic/stores/index.ts`
- Test: `src/pages/superMagic/stores/__tests__/http-authoritative-sync-recovery.test.ts`

- [x] Add exported recovery state/failure payload types with status, reason, attempts, and elapsed time.
- [x] Track recovery session start time, attempts, in-flight sync ownership, status, timer, and failure emission per `topicId + correlationId`.
- [x] Suppress watchdog emission while a current topic sync is active; merge newly armed watchdogs into the in-flight request.
- [x] Enforce at most three emitted requests or 30 seconds elapsed, whichever occurs first, checking both before scheduling and inside the timer callback.
- [x] On exhaustion, cancel pending timers, store `recovery_failed`, and emit the failure event exactly once without ending task thinking or removing the draft.
- [x] Reset the recovery session when meaningful content/reasoning/tool progress arrives; clear it on final/cancel/task terminal.
- [x] Implement `getStreamRecoveryState()` and `registerOnStreamRecoveryFailed()`.
- [x] Run recovery dedupe, reset classification, budget, and timer regression suites.

### Task 6: Apply task terminal barriers independently of HTTP success

**Files:**

- Modify: `src/pages/superMagic/stores/index.ts`
- Test: `src/pages/superMagic/stores/__tests__/http-authoritative-sync-recovery.test.ts`

- [x] When the current sync completes with terminal task status, settle the task's existing stream/watchdog even when the HTTP request failed.
- [x] Preserve the visible draft and message records.
- [x] Keep later HTTP retry independent and prevent it from resurrecting the old stream.
- [x] Allow a later chunk with a new correlation in the same topic to start a new stream.
- [x] Run the task-terminal case and topic-switch/timer regressions.

### Task 7: Verify and record the completed behavior

**Files:**

- Modify: `src/pages/superMagic/stores/tests.md`

- [x] Run the focused target twice; final result `61/61` on both runs.
- [x] Run `final-assistant-message`, `tool-call-argument-assembly`, `tool-response-execution-state`, `message-list-ui-projection`, `message-buffer`, `topic-correlation-message-identity`, `render-state-machine-timers`, `resource-performance`, and `chunk-transport-ordering`.
- [x] Run Hook/coordinator focused tests for full pagination, partial-failure atomicity, owner/topic/task invalidation, PubSub cleanup, and singleton request handling.
- [x] Run focused Prettier/ESLint where repository infrastructure permits and `git diff --check` on touched files.
- [x] Update the current HTTP ledger with final counts and remaining unrelated adjacent REDs.
- [x] Do not stage, commit, or overwrite unrelated working-tree changes.
