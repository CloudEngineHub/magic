# Share Tool Response Settlement Implementation Plan

> **For agentic workers:** Execute inline in the current checkout because the user requested a direct fix and the working tree already contains related uncommitted changes. Do not stage or commit.

**Goal:** Stop historical share-tool cards from remaining permanently loading when a later Assistant proves the workflow advanced but the role=`tool` response is absent.

**Architecture:** Keep recovery ownership in the Store share-ingestion path. Track only the latest chronological share replay state per topic, settle unresolved non-`ask_user` tool calls at a different-correlation Assistant barrier, and keep `response_missing` weak so a late real response can replace it. Normalize the raw share topic into the projected message so the UI reads the same canonical topic bucket.

**Tech Stack:** TypeScript, MobX, React message projection, Vitest.

---

### Task 1: Add failing Store regressions

**Files:**

- Modify: `src/pages/superMagic/stores/__tests__/tool-response-execution-state.test.ts`

- [ ] Add a real-share-shape fixture whose top-level `topic_id` is absent and whose raw Assistant contains a running tool call.
- [ ] Assert that a later Assistant with a different correlation writes `response_missing` under the raw topic ID.
- [ ] Assert that a late real tool response upgrades the weak terminal to `finished`.
- [ ] Assert that replaying an older Assistant does not settle the latest Assistant's pending tools.
- [ ] Run the focused test names and confirm they fail because `loadSharedMessages()` lacks share completion-barrier handling.

### Task 2: Add failing share projection regression

**Files:**

- Create: `src/pages/share/components/MessageList/__tests__/utils.test.ts`

- [ ] Pass a share message whose topic exists only in `raw_content.super_magic_message.topic_id`.
- [ ] Assert that `messagesTransformer()` projects that stable topic ID for `MessageNode`/`ToolCall` lookup.
- [ ] Run the new test and confirm it fails with an undefined projected topic.

### Task 3: Implement the minimal Store fix

**Files:**

- Modify: `src/pages/superMagic/stores/index.ts`

- [ ] Add a private, non-observable per-topic share replay sidecar containing the latest processed message ID and the currently pending Assistant tool calls.
- [ ] Derive the canonical topic from `sharedMessage.topic_id` with `rawNode.topic_id` fallback.
- [ ] On a chronologically newer Assistant with a different correlation, settle the previous unresolved ordinary tools as `response_missing` before registering the current Assistant.
- [ ] Preserve pending tools for same-correlation revisions when `tool_calls` is absent; replace them when `tool_calls` is explicitly present.
- [ ] Continue routing all real role=`tool` payloads through `recordToolResponse()` so late responses overwrite weak terminals.
- [ ] Ignore older replayed Assistant messages for barrier state while still keeping message projection idempotent.

### Task 4: Normalize the share UI topic projection

**Files:**

- Modify: `src/pages/share/components/MessageList/utils.ts`

- [ ] Project `topic_id` from the top-level field with raw SuperMagic node fallback.
- [ ] Keep all other share projection fields unchanged.

### Task 5: Verify the focused behavior

**Files:**

- Verify: `src/pages/superMagic/stores/index.ts`
- Verify: `src/pages/superMagic/stores/__tests__/tool-response-execution-state.test.ts`
- Verify: `src/pages/share/components/MessageList/utils.ts`
- Verify: `src/pages/share/components/MessageList/__tests__/utils.test.ts`

- [ ] Run the new focused Store regressions.
- [ ] Run the new share utility regression.
- [ ] Run the full `tool-response-execution-state.test.ts` suite.
- [ ] Run ESLint on touched TypeScript files, Prettier check, and `git diff --check`.
- [ ] Confirm whether `enterprise/` contains a mirrored implementation requiring synchronization.
