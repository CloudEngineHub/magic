# SuperMagic Conversation Round Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reversible IndexedDB query, multi-tab-aware compression/cleaning, and restoration for manually reported SuperMagic conversation rounds.

**Architecture:** Keep generic Dexie storage unchanged, add writer metadata and a write barrier to the existing persistence layer, and place report-specific pure transformations plus querying in a dynamically imported Store-adjacent facade. AssistantCard supplies the selected Store round only as the scope oracle and reports the cleaned ordered array.

**Tech Stack:** TypeScript, Dexie, MobX, React 18, Vitest, dynamic `import()`.

---

### Task 1: Define codec behavior with failing tests

**Files:**

- Create: `src/pages/superMagic/stores/__tests__/conversation-round-report.test.ts`
- Create: `src/pages/superMagic/stores/conversation-round-report.ts`

- [ ] Add tests that construct two writer copies of one User/Chunk/Final flow and expect one ordered cleaned flow.
- [ ] Add a test where both writers observe two identical Chunk broadcasts and expect exactly two retained occurrences with the second marked `duplicate: true`.
- [ ] Add a same-`i`, different-content test and expect both variants with `conflict: true`.
- [ ] Add a legacy-record test and expect all observations to survive with `dedupe_uncertain: true`.
- [ ] Add a restoration test that expands compacted Chunk groups and reproduces User/Chunk/Final/Chunk/Final order.
- [ ] Run `corepack pnpm exec vitest run --config ./vitest.config.ts src/pages/superMagic/stores/__tests__/conversation-round-report.test.ts` and verify failure because the report module/API does not exist.

### Task 2: Implement the pure codec and query facade

**Files:**

- Create: `src/pages/superMagic/stores/conversation-round-report.ts`
- Test: `src/pages/superMagic/stores/__tests__/conversation-round-report.test.ts`

- [x] Export `queryConversationRoundLogs(topicId)` returning `{ storageId, value }[]`.
- [x] Export `compressConversationRoundLogs({ records, roundMessages, preferredWriterId })` returning the ordered report array.
- [x] Export `restoreConversationRoundLogs(report)` returning individual persisted/runtime message values in report-array order.
- [ ] Implement stable non-mutating serialization for payload comparison after excluding local WebSocket metadata.
- [ ] Implement per-writer occurrence alignment for Chunk variants and exact revision dedupe for User/Final records.
- [ ] Implement consecutive Chunk grouping that flushes at every complete-message boundary.
- [ ] Run the focused codec test and verify it passes.

### Task 3: Add writer metadata and a persistence barrier

**Files:**

- Modify: `src/pages/superMagic/stores/persistence.ts`
- Modify: `src/pages/superMagic/stores/index.ts`
- Modify: `src/pages/superMagic/stores/__tests__/persistence-replay.test.ts`

- [ ] Add failing persistence assertions for `writer_id`, monotonic `writer_sequence`, and `waitForMessagePersistence()`.
- [ ] Extend `WebSocketRecordSource` with `conversation_message` and add writer fields to metadata.
- [ ] Generate one page-lifecycle writer ID with `createRandomUuidV4()` and one monotonically increasing writer sequence.
- [ ] Serialize Dexie writes through a tracked promise and export `waitForMessagePersistence()`.
- [ ] Add a public Store method that flushes one Topic persistence queue and waits for the tracked write.
- [ ] Record Text/RichText User sequences from `Super_Magic_New_Message_V2` while retaining the existing Final source label.
- [ ] Run focused persistence tests and verify they pass.

### Task 4: Dynamically integrate AssistantCard

**Files:**

- Modify: `src/pages/superMagic/components/MessageList/components/Card/AssistantCard.tsx`
- Modify: `src/pages/superMagic/components/MessageList/components/Card/__tests__/AssistantCard.test.tsx`

- [ ] Update the component test to mock the dynamic report module and expect the cleaned report array in `logger.report`.
- [ ] Make `reportConversationRound` asynchronous.
- [ ] Flush/wait for Topic persistence, dynamically import the report facade, query the Topic, compress using the current round scope, and report the result.
- [ ] Keep the report module out of static imports.
- [ ] Run the focused AssistantCard and round-log tests.

### Task 5: Verify the complete scoped change

**Files:**

- Verify all modified files above.

- [ ] Run the new codec test, persistence replay test, AssistantCard test, and round-log test together.
- [ ] Run targeted ESLint on the changed TypeScript/TSX files.
- [ ] Run `git diff --check`.
- [ ] Confirm `enterprise/src/pages/superMagic/` has no matching overlay requiring synchronization.
- [ ] Re-run `git status --short --branch` and separate pre-existing changes from this implementation.
