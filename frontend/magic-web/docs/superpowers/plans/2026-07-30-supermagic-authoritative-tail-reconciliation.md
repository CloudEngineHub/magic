# SuperMagic Authoritative Tail Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. This checkout already contains the preceding SuperMagic HTTP reconciliation changes, so execution continues in place without staging or committing.

**Goal:** Reconcile `messages/queries` as authoritative membership from the newest message through a proven local common anchor, removing locally retained rollback branches that are absent from that covered suffix.

**Architecture:** The Hook aggregates descending HTTP pages without mutating the Store until it either finds a stable local `super_message_id` anchor or reaches `has_more=false`. A proven anchor commits one atomic `replace_tail` Store write; an exhausted complete query commits the existing full `replace`; incomplete pagination falls back without membership deletion. Store normalization, optimistic-message restoration, stream overlays, node cleanup, and real `seq_id` sorting stay centralized in `initializeMessages`.

**Tech Stack:** React 18 hooks, MobX, TypeScript, Vitest, `corepack pnpm`.

---

### Task 1: Store-level authoritative tail contract

**Files:**

- Modify: `src/pages/superMagic/stores/types.ts`
- Modify: `src/pages/superMagic/stores/index.ts`
- Test: `src/pages/superMagic/stores/__tests__/http-authoritative-sync-recovery.test.ts`

- [x] Add RED tests proving that `replace_tail` preserves the anchor prefix, removes all absent persisted messages after the anchor, accepts the HTTP suffix, and falls back to no destructive write if the anchor is no longer present.
- [x] Add RED coverage proving optimistic User restoration and active Assistant stream overlays survive tail replacement, while removed message nodes are no longer returned by `getMessageNode`.
- [x] Extend `InitializeMessagesOptions` with `mode: "replace_tail"` and `anchorSuperMessageId`.
- [x] Initialize the authoritative list from `previousMessages.slice(0, anchorIndex + 1)` for a valid tail anchor, reuse the current HTTP normalization path, then run snapshot cleanup for both `replace` and `replace_tail`.
- [x] If the Store cannot find the requested anchor at commit time, degrade to `merge` and return without deleting membership.
- [x] Run the focused Store test file and keep all existing HTTP/recovery contracts green.

### Task 2: Hook-level bounded anchor traversal

**Files:**

- Modify: `src/pages/superMagic/hooks/useTopicMessages.ts`
- Test: `src/pages/superMagic/hooks/__tests__/useTopicMessages.test.tsx`

- [x] Turn the existing P1 `it.fails` cases into active RED contracts for bounded pagination, atomic commit after reaching the anchor, `has_more=false` full replacement, token failure, and page-budget exhaustion.
- [x] Build stable local anchor candidates from `super_message_id || app_message_id`, excluding messages with optimistic sidecar status and active stream identities.
- [x] Fetch up to three pages, dedupe by normalized SuperMessage identity, and stop at the newest common local anchor.
- [x] Trim the aggregate to newest-through-anchor and call `initializeMessages(topicId, items, { mode: "replace_tail", anchorSuperMessageId })` exactly once.
- [x] When `has_more=false` is reached without an anchor, aggregate the complete query and call `{ mode: "replace" }` exactly once.
- [x] On request failure, missing/repeated token, or page-budget exhaustion, perform no membership deletion and report the sync as incomplete.
- [x] Route WebSocket notifications, resident polling, and stable foreground reconciliation through this shared path while retaining history `merge` and full recovery `replace` semantics.

### Task 3: Cross-Tab rollback regression and sidecar convergence

**Files:**

- Modify: `src/pages/superMagic/hooks/useTopicMessages.ts`
- Test: `src/pages/superMagic/hooks/__tests__/useTopicMessages.persistent-assistant.test.tsx`
- Test: `src/pages/superMagic/hooks/__tests__/useTopicMessages.test.tsx`

- [x] Add a black-box regression with local `[P, messageA branch]`, a messageB notification, and HTTP `[messageB, P]`; assert Canonical Store and UI projection end as `[P, messageB]`.
- [x] Assert the entire User/Assistant/Tool rollback branch disappears, not only the User row.
- [x] Clear the local revoked anchor and hidden optimistic IDs when that anchor is absent inside an authoritative replaced suffix; retain it for incomplete pagination or an explicitly returned revoked tail.
- [x] Preserve the existing contract that messages before the public anchor remain untouched.

### Task 4: Verification and overlay review

**Files:**

- Review: `enterprise/src/opensource/`

- [x] Run focused Hook and Store Vitest suites.
- [x] Run adjacent revoked projection, message-buffer, Final, chunk ordering, and topic-switching suites.
- [x] Run ESLint on changed source/test files where the repository configuration permits it.
- [x] Run Prettier checks and `git diff --check`.
- [x] Confirm there is no enterprise overlay requiring a synchronized change.
- [x] Report tests and remaining backend/manual validation without staging or committing.

Verification note: the focused authoritative-tail suites pass 119/119 and the adjacent revoked projection, message-buffer, Final, and topic-switching suites pass 115/115. `chunk-transport-ordering.test.ts` currently passes 44/51; its seven multi-choice protocol failures reproduce independently on HEAD code paths that this plan does not modify, so they remain a separate RED instead of expanding this membership-reconciliation change.
