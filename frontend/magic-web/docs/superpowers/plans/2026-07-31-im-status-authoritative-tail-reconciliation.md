# SuperMagic IM Status Authoritative-Tail Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure HTTP reconciliation applies every returned IM `status` by `topicId + app_message_id` without allowing the `super_message_id` membership anchor to truncate revoked User state.

**Architecture:** Keep membership reconciliation and IM status reconciliation as two coordinated outputs of the same accepted HTTP query. `super_message_id` remains responsible for Assistant logical-card membership/revision merging; `imStatus` is reconciled per `app_message_id`. A successful accepted tail writes both in one Store action; failed or incomplete pagination writes neither.

**Tech Stack:** React 18, TypeScript, MobX, Vitest, `corepack pnpm`.

---

### Task 1: Add the browser-B regression at the Hook/Store boundary

**Files:**
- Modify: `src/pages/superMagic/hooks/__tests__/useTopicMessages.persistent-assistant.test.tsx`

- [x] **Step 1: Add a failing scenario**

Create a local canonical sequence with a stable User prefix, a User C, and an Assistant D. Seed C/D as `read`. Return the HTTP tail in descending order with D still `read` and C `revoked`, while the response declares another page. Trigger the persistent-message HTTP reconciliation and assert C becomes `revoked`; assert D remains canonical and the visible projection enters the revoked branch through C.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
corepack pnpm exec vitest run --config ./vitest.config.ts src/pages/superMagic/hooks/__tests__/useTopicMessages.persistent-assistant.test.tsx -t "HTTP tail 对账必须更新公共锚点之前的 User 撤回状态" --reporter=verbose
```

Expected result: FAIL because `fetchAuthoritativeTail()` truncates `pulledItems` at D and C remains `read`.

### Task 2: Separate status observations from tail membership

**Files:**
- Modify: `src/pages/superMagic/hooks/useTopicMessages.ts:54-68,355-494,525-568`
- Modify: `src/pages/superMagic/stores/types.ts:25-32`

- [x] **Step 1: Extend the authoritative-tail result**

Add a `statusItems` collection to the tail result while retaining `pulledItems` as the membership snapshot. `statusItems` must aggregate raw fetched envelopes by `app_message_id` before `shouldIncludeFetchedMessage()` and before `super_message_id` membership dedupe. Keep `pulledItems` filtered/deduped/truncated exactly for membership semantics.

- [x] **Step 2: Preserve failed-pagination atomicity**

When the tail cannot prove a common anchor, the required HTTP sequence is not reached, a page request fails, or the pagination budget is exhausted, return `didPullSucceed: false` and do not expose a writable `statusItems` result to `pullMessage()`.

- [x] **Step 3: Pass the accepted status observations to the Store**

For `authoritative_tail`, pass both `statusItems` and the truncated membership `pulledItems` to one Store reconciliation method. For `replace`, `merge`, and `incremental`, route their observed envelopes through the same status coordination primitive instead of creating a tail-only special case.

### Task 3: Make IM status ownership app-message scoped in the Store

**Files:**
- Modify: `src/pages/superMagic/stores/index.ts:1980-2147,2154-2617`
- Modify: `src/pages/superMagic/stores/types.ts`

- [x] **Step 1: Add a coordinated HTTP write entry**

Introduce an internal/public method that accepts `{ statusItems, membershipItems, writeOptions, syncGeneration }`, consumes the topic-scoped restore authorization once, applies `imStatus`, and then applies membership inside the same MobX action.

- [x] **Step 2: Match IM status strictly by `app_message_id`**

Use `topicId + app_message_id` for persisted IM status updates. Do not use a same-`super_message_id` Assistant fallback for ordinary status reconciliation. Retain only the active stream-placeholder exception that first promotes the real persistent `app_message_id` and then writes that message's status.

- [x] **Step 3: Keep status and execution domains separate**

The status pass may trigger the existing revoked stream barrier, but it must not overwrite `superStatus`, node content, tool state, or Assistant revision identity. Membership/revision processing continues to own those fields.

- [x] **Step 4: Preserve restore authorization semantics**

Pass the single consumed `allowImStatusRestore` decision through both status and membership phases. A normal HTTP `read/seen` snapshot must not restore a canonical `revoked` message without explicit authorization.

### Task 4: Add Store and projection regression coverage

**Files:**
- Modify: `src/pages/superMagic/stores/__tests__/http-authoritative-sync-recovery.test.ts`
- Modify: `src/pages/superMagic/hooks/__tests__/useTopicMessages.persistent-assistant.test.tsx`
- Modify: `src/pages/superMagic/utils/__tests__/project-visible-messages-by-revoked-tail.test.ts`

- [x] **Step 1: Add the User-revoked/Assistant-read case**

Assert a revoked User anchor updates even when a later Assistant is the first common membership anchor, and that the Assistant's `superStatus` remains unchanged.

- [x] **Step 2: Add same-SuperMessage isolation**

Use two different `app_message_id` values sharing one `super_message_id`; assert a revoked status on one never changes the other.

- [x] **Step 3: Add failed-tail atomicity coverage**

Assert a failed continuation page does not commit either partial membership or partial status observations.

- [x] **Step 4: Re-run the existing restore tests**

Keep ordinary HTTP restore blocked and explicit one-shot authorization green.

### Task 5: Verification

**Files:**
- No production files beyond Tasks 2–3.

- [x] **Step 1: Run focused Hook, Store, and projection suites**

```bash
corepack pnpm exec vitest run --config ./vitest.config.ts \
  src/pages/superMagic/hooks/__tests__/useTopicMessages.persistent-assistant.test.tsx \
  src/pages/superMagic/stores/__tests__/http-authoritative-sync-recovery.test.ts \
  src/pages/superMagic/utils/__tests__/project-visible-messages-by-revoked-tail.test.ts \
  src/pages/superMagic/components/MessageList/__tests__/MessageList.revoked-projection.test.tsx
```

- [x] **Step 2: Run focused lint and type checks**

```bash
corepack pnpm exec eslint src/pages/superMagic/hooks/useTopicMessages.ts src/pages/superMagic/stores/index.ts src/pages/superMagic/stores/types.ts src/pages/superMagic/hooks/__tests__/useTopicMessages.persistent-assistant.test.tsx src/pages/superMagic/stores/__tests__/http-authoritative-sync-recovery.test.ts
```

Run the repository's existing typecheck command if available; report pre-existing errors separately.

- [x] **Step 3: Check the final diff**

```bash
git diff --check -- src/pages/superMagic/hooks/useTopicMessages.ts src/pages/superMagic/stores/index.ts src/pages/superMagic/stores/types.ts src/pages/superMagic/hooks/__tests__/useTopicMessages.persistent-assistant.test.tsx src/pages/superMagic/stores/__tests__/http-authoritative-sync-recovery.test.ts src/pages/superMagic/utils/__tests__/project-visible-messages-by-revoked-tail.test.ts
```

Do not stage or commit existing or new worktree changes.
