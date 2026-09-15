# SuperMagic Missing Tool Response Black-Box TDD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development and execute each task in RED-GREEN order. Do not read `src/pages/superMagic/stores/index.ts` until Tasks 1-3 are complete.

**Goal:** Reproduce and protect the missing Tool response fallback from the public Store, polling, and rendered UI boundaries before applying the smallest business-logic fix.

**Architecture:** The Store owns canonical Tool execution state, while the UI only renders that state. Tests first prove three boundaries independently: completion-barrier semantics through public Store APIs, propagation of a terminal topic state through the real message-sync hook, and removal of the real ToolCall spinner when canonical state becomes `response_missing`.

**Tech Stack:** TypeScript, React 18, MobX, Vitest, Testing Library.

---

### Task 1: Isolate the successor-Assistant completion barrier

**Files:**

- Modify: `src/pages/superMagic/stores/__tests__/tool-response-execution-state.test.ts`

- [x] Add a black-box case where the previous Assistant owns a running ordinary tool and the following Assistant is explicitly `status="running"`.
- [x] Assert the previous tool is `running` before the following message.
- [x] Enqueue the following Assistant and assert the previous canonical/effective state becomes `response_missing` without relying on a finished current Assistant.
- [x] Run the focused case and classify it as existing GREEN behavior or a Store RED.

### Task 2: Prove real ToolCall spinner behavior

**Files:**

- Modify: `src/pages/superMagic/components/MessageList/components/Nodes/MessageNode/__tests__/ToolCall.knowledgeSearch.test.tsx`

- [x] Repair the test harness so the suite collects without replacing MobX observer behavior needed by the regression.
- [x] Render a normal ToolCall with embedded `status="running"` and no canonical response; assert loading is visible.
- [x] Insert canonical `{ status: "response_missing" }` for the same topic and tool id; assert the rendered loading state disappears.
- [x] Keep `ask_user` outside this ordinary-tool fallback contract.
- [x] Run the component file and verify the new test reaches assertions rather than failing during module collection.

### Task 3: Reproduce the live polling completion-barrier gap

**Files:**

- Modify: `src/pages/superMagic/hooks/__tests__/useTopicMessages.test.tsx`

- [x] Extend the Store mock with the public synchronization methods used by the hook.
- [x] Start with a selected topic in `running` state and complete its initial message load.
- [x] Rerender the same topic as `finished`, advance the live polling interval, and return a successful HTTP page with no Tool response.
- [x] Assert the successful polling cycle reports the finished task barrier to the Store so unresolved tools can settle.
- [x] Run the focused hook test and confirm it fails specifically because the terminal polling path does not finalize the Store.

### Task 4: Implement the smallest RED-driven fix

**Files:**

- Inspect only after Tasks 1-3: `src/pages/superMagic/stores/index.ts`
- Modify only if required by RED evidence: `src/pages/superMagic/stores/index.ts`
- Modify only if the missing boundary is outside the Store: `src/pages/superMagic/hooks/useTopicMessages.ts`

- [x] Trace the failing public event into the Store after the RED test is established.
- [x] Preserve T2: no `response_missing` for a merely running Final without a business completion barrier.
- [x] Ensure a successful terminal HTTP/polling barrier settles ordinary unresolved tools without fabricating a role=`tool` message.
- [x] Preserve `ask_user`, stable `tool.id`, multi-tool isolation, and late real response overwrite semantics.
- [x] Make only the minimal change required for the RED test to pass.

Outcome: Store black-box coverage proved that `completeTopicSync(... taskStatus="finished")` already settles an empty incremental poll. The production gap was isolated to `useTopicMessages.ts`; `stores/index.ts` required no additional change for this scenario.

### Task 5: Focused verification

**Files:**

- Review: `enterprise/src/pages/superMagic/` for a corresponding hook, Store, adapter, or test overlay.

- [x] Run the three focused test files together.
- [x] Run the existing final-Assistant and HTTP-authoritative Store suites as adjacent regressions.
- [x] Run file-scoped ESLint/Prettier checks where feasible.
- [x] Run `git diff --check` and report unrelated baseline failures separately.
- [x] Do not stage, commit, create a worktree, or discard existing user changes.
