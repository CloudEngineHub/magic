# SuperMagic Tool Owner and Task Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 20 confirmed SuperMagic Store RED tests pass by adding Topic-scoped `tool.id` ownership, orphan `finish_task` routing, detail-only response normalization, and the typed `task.completed` event.

**Architecture:** Keep the existing `toolResponseMap(topicId -> tool.id)` and typed event emitter unchanged for consumers. Add one private non-observable owner sidecar to `SuperMagicStore`, centralize response admission/normalization in `recordToolResponse`, and extend the existing event contracts/transition ledger with one task-completion event. Do not reintroduce listener registries or change UI tool lookup keys.

**Tech Stack:** TypeScript, MobX, Vitest, existing SuperMagic Store typed-event infrastructure.

---

### Task 1: Capture the Current RED Baseline

**Files:**
- Test: `src/pages/superMagic/stores/__tests__/http-authoritative-sync-recovery.test.ts`
- Test: `src/pages/superMagic/stores/__tests__/store-events.test.ts`
- Test: `src/pages/superMagic/stores/__tests__/tool-call-argument-assembly.test.ts`
- Test: `src/pages/superMagic/stores/__tests__/tool-response-execution-state.test.ts`
- Test: `src/pages/superMagic/stores/__tests__/topic-correlation-message-identity.test.ts`

- [ ] **Step 1: Run the five confirmed failing files**

Run:

```bash
corepack pnpm exec vitest run --config ./vitest.config.ts \
  src/pages/superMagic/stores/__tests__/http-authoritative-sync-recovery.test.ts \
  src/pages/superMagic/stores/__tests__/store-events.test.ts \
  src/pages/superMagic/stores/__tests__/tool-call-argument-assembly.test.ts \
  src/pages/superMagic/stores/__tests__/tool-response-execution-state.test.ts \
  src/pages/superMagic/stores/__tests__/topic-correlation-message-identity.test.ts
```

Expected: 20 failing tests distributed as `1 + 3 + 1 + 13 + 2`.

### Task 2: Add Topic-Scoped Tool Ownership and Response Admission

**Files:**
- Modify: `src/pages/superMagic/stores/index.ts`
- Test: the five files from Task 1

- [ ] **Step 1: Add the private owner sidecar**

Add a non-observable Store field:

```ts
private toolCallOwners = new Map<string, Map<string, string>>()
```

Register it as `false` in `makeAutoObservable`.

- [ ] **Step 2: Add ownership helpers**

Add private helpers with these exact semantics:

```ts
private getToolCallOwner(topicId: string, toolId: string): string | undefined

private claimToolCallOwner(
  topicId: string,
  correlationId: string,
  toolId: string,
): "claimed" | "owned" | "conflict"
```

An empty identity returns `conflict`; a missing owner is claimed; a matching owner is accepted; a different owner is rejected. Do not release an owner on Final, `finish_reason`, StreamState cleanup, or HTTP replacement.

- [ ] **Step 3: Enforce ownership on streamed tool calls**

In `applyOrderedChunk`, before a tool with a non-empty ID mutates `streamState.tool_calls`, claim/check `topicId + tool.id`. Reject only the conflicting tool item so other unique tools in the same chunk continue.

- [ ] **Step 4: Enforce ownership on Assistant snapshots**

Add a private helper that clones and filters Assistant `tool_calls`, claiming unowned IDs and excluding IDs owned by another correlation. Use it before Final reconciliation and HTTP/nonterminal snapshot merging so Assistant content remains canonical while conflicting tools do not enter effective `tool_calls`.

- [ ] **Step 5: Enforce ownership on role=tool responses**

In `recordToolResponse`, ordinary responses may write canonical state only when `getToolCallOwner(topicId, toolId) === messageNode.correlation_id`. A rejected response remains available through the raw message path but does not update `toolResponseMap` or publish `toolCall.settled`.

- [ ] **Step 6: Run owner-focused tests**

Run the Task 1 command with only the HTTP, tool-call, tool-response, topic-identity, and store-event owner cases. Expected: the 11 ordinary owner/orphan failures pass; detail-only and task-event failures remain RED.

### Task 3: Normalize Detail-Only Tool Responses

**Files:**
- Modify: `src/pages/superMagic/stores/index.ts`
- Test: `src/pages/superMagic/stores/__tests__/tool-response-execution-state.test.ts`

- [ ] **Step 1: Normalize admitted responses before merge**

After ownership admission and before seq arbitration, clone the raw tool response. When `rawTool.status === undefined`, set canonical `incoming.status` to the current valid status or `running` when no valid history exists. Never mutate `messageNode.tool`, so raw status remains absent.

- [ ] **Step 2: Emit one stable protocol warning per revision**

Reuse the existing seq sidecar and `shouldReportProtocolWarning`. Emit:

```ts
console.warn("[SuperMagicStore] tool response missing status", {
  code: "tool-response-missing-status",
  topicId,
  toolId,
  fallbackStatus,
  resolution: currentHasValidStatus
    ? "preserve-current-status"
    : "default-running",
})
```

Do not warn or normalize rejected orphan responses.

- [ ] **Step 3: Run detail-only tests**

Run:

```bash
corepack pnpm exec vitest run --config ./vitest.config.ts \
  src/pages/superMagic/stores/__tests__/tool-response-execution-state.test.ts
```

Expected: the seven detail-only tests pass without regressing seq, terminal monotonicity, or `response_missing` replacement tests.

### Task 4: Route Orphan finish_task and Add task.completed

**Files:**
- Create: `src/pages/superMagic/stores/events/contracts/task-completed.ts`
- Modify: `src/pages/superMagic/stores/events/event-map.ts`
- Modify: `src/pages/superMagic/stores/events/index.ts`
- Modify: `src/pages/superMagic/stores/events/internal/transition-ledger.ts`
- Modify: `src/pages/superMagic/stores/index.ts`
- Modify: `src/pages/superMagic/hooks/useRefreshTopicDetailOnTaskComplete.ts`
- Modify: `src/pages/superMagic/stores/__tests__/store-events.test.ts`

- [ ] **Step 1: Add the public event contract**

Define `TaskCompletedEvent` with type `task.completed`, standard event meta plus required `correlationId`, `appMessageId`, and `taskId`, and payload source `finish_task` containing tool detail and outer message attachments. Export it and add it to `SuperMagicEventMap`.

- [ ] **Step 2: Add task-level exactly-once transition state**

Add a private `completedTasks` set and `recordTaskCompleted(taskKey)` to the existing transition ledger. Extend Store event entity kinds with `task`; key by `topicId + taskId`.

- [ ] **Step 3: Admit only the precise orphan finish_task exception**

An ownerless response is admitted as the low-level `finish_task` canonical fact only when role is `tool`, name is `finish_task`, `task_id` is non-empty, and `tool.id` is a numeric string. It must not establish an Assistant owner, create a `tool_call_id` alias, synthesize an Assistant call, or publish ordinary `toolCall.settled`.

- [ ] **Step 4: Publish task.completed after canonical commit**

From the existing message-commit path, publish `message.committed` first, then exactly one `task.completed`. Do not publish `message.completed` for the tool-role result. Map detail from `messageNode.tool.detail` and attachments from `messageNode.attachments`.

- [ ] **Step 5: Migrate the task-completion consumer**

Change `useRefreshTopicDetailOnTaskComplete` from `message.completed` to `task.completed`, retaining its current single-flight and pending-refresh behavior. Use `taskId + appMessageId` as its local handled-event key.

- [ ] **Step 6: Remove the temporary test cast**

Import `TaskCompletedEvent` in `store-events.test.ts`, subscribe normally, and remove `TaskCompletedProjectionEvent`/`SubscribeTaskCompleted` structural escape types.

- [ ] **Step 7: Run Store event tests**

Run:

```bash
corepack pnpm exec vitest run --config ./vitest.config.ts \
  src/pages/superMagic/stores/__tests__/store-events.test.ts \
  src/pages/superMagic/stores/events/__tests__/emitter.test.ts \
  src/pages/superMagic/hooks/__tests__/useTopicMessages.persistent-assistant.test.tsx \
  src/pages/superMagic/hooks/__tests__/useScopedTopicReadProgress.test.tsx
```

Expected: orphan `finish_task` publishes no ordinary settlement, publishes one typed `task.completed`, and typed emitter behavior remains green.

### Task 5: Verify the Complete Change

**Files:**
- Review all files modified in Tasks 2-4

- [ ] **Step 1: Run the five original RED files plus emitter tests**

Expected: all original 20 RED tests are green.

- [ ] **Step 2: Run the complete Store test directories**

```bash
corepack pnpm exec vitest run --config ./vitest.config.ts \
  src/pages/superMagic/stores/__tests__ \
  src/pages/superMagic/stores/events/__tests__
```

Expected target: 496/496 tests pass.

- [ ] **Step 3: Run lint and whitespace validation**

```bash
corepack pnpm lint
git diff --check
```

Expected: no new lint or whitespace errors attributable to this change.

- [ ] **Step 4: Review overlay and worktree boundaries**

Confirm no `enterprise/src` counterpart exists in this checkout. Run `git status --short` and report only files changed for this task separately from the pre-existing dirty worktree. Do not stage or commit.
