# Default Agent Fallback Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make configured default employees work in HTML file actions, keep automatic fallback runtime-only, and reconcile stale preferences after an authoritative empty mode-list response.

**Architecture:** Keep selection normalization inside `DefaultAgentSelectionService`, but separate user selection from automatic recovery at the editor-context seam. Expose an explicit mode-availability readiness signal from `SuperMagicModeService` so `RoleStore` can distinguish “not loaded” from “loaded and empty”.

**Tech Stack:** React 18, TypeScript, MobX, Vitest, Testing Library, ESLint/Prettier.

## Global Constraints

- Mobile conversation pages remain supported, while `TopicMode.Chat` remains unavailable as a mobile ModeToggle selection.
- Only explicit user mode selection may update global or project localStorage preferences.
- Empty invalid topics recover silently to the configured default selection without persisting it.
- Topics containing messages keep the invalid-mode fallback UI.
- Hidden but available employees remain valid defaults.
- Do not modify enterprise overlays unless a corresponding implementation exists.

---

### Task 1: Validate HTML MagicFiles Through the Selection Module

**Files:**

- Modify: `src/pages/superMagic/components/Detail/contents/HTML/iframe-api/hooks/useMagicFiles.ts:302-327`
- Modify: `src/pages/superMagic/components/Detail/contents/HTML/iframe-api/hooks/__tests__/useMagicFiles.test.ts`

**Interfaces:**

- Consumes: `resolveAgentSelection(modeIdentifier?, explicitAgentCode?)`
- Consumes: `isAgentSelectionAvailable(modeIdentifier?, explicitAgentCode?)`
- Produces: valid `selection.modeIdentifier` for `project_mode`

- [ ] **Step 1: Add failing tests for configured employee defaults**

Mock `DefaultAgentSelectionService` directly so the hook test crosses the same seam as production without loading MobX user stores:

```typescript
const defaultAgentSelectionMock = vi.hoisted(() => ({
	modeIdentifier: "agent-default",
	isAvailable: true,
}))

vi.mock("@/services/superMagic/DefaultAgentSelectionService", () => ({
	resolveAgentSelection: () => ({
		modeIdentifier: defaultAgentSelectionMock.modeIdentifier,
		topicPattern: defaultAgentSelectionMock.modeIdentifier,
	}),
	isAgentSelectionAvailable: () => defaultAgentSelectionMock.isAvailable,
}))
```

Add cases proving an omitted `agentMode` creates a topic with `project_mode: "agent-default"` and an unavailable selection returns `Invalid agentMode`.

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
pnpm exec vitest run src/pages/superMagic/components/Detail/contents/HTML/iframe-api/hooks/__tests__/useMagicFiles.test.ts
```

Expected: the configured employee case fails because the current implementation only accepts `Object.values(TopicMode)`.

- [ ] **Step 3: Replace enum-only validation**

Resolve the request once and validate through the selection module:

```typescript
const selection = resolveAgentSelection(agentMode)
if (!isAgentSelectionAvailable(selection.modeIdentifier, selection.agentCode)) {
	replyToIframe(replyType, requestId, {
		success: false,
		error: `Invalid agentMode: ${selection.modeIdentifier}`,
	})
	return
}

const finalAgentMode = selection.modeIdentifier as TopicMode
```

Use `finalAgentMode` consistently for topic creation, optimistic topic state, and pubsub.

- [ ] **Step 4: Run the focused test and verify success**

Expected: all `useMagicFiles` tests pass, including configured non-SMA and invalid-selection cases.

---

### Task 2: Separate Explicit Selection from Runtime Recovery

**Files:**

- Modify: `src/pages/superMagic/hooks/useTopicMode.ts`
- Modify: `src/pages/superMagic/components/MainInputContainer/components/editors/types.ts:56-60`
- Modify: `src/pages/superMagic/components/MessagePanel/types.ts:8-11`
- Modify: `src/pages/superMagic/components/ProjectPageInputContainer/index.tsx:91-98`
- Modify: `src/pages/superMagic/pages/TopicPage/components/TopicMessagePanel.tsx`
- Modify: `src/pages/superMagicMobile/pages/TopicPage/index.tsx`
- Modify: `src/pages/superMagicMobile/pages/ChatPage/index.tsx:142-170`
- Modify: `src/pages/superMagic/components/MessageEditor/hooks/useInvalidTopicModeFallback.ts`
- Modify: `src/pages/superMagic/components/Detail/contents/HTML/hooks/useInspectorToolbarMode.ts:62-73`
- Create: `src/pages/superMagic/components/MessageEditor/hooks/__tests__/useInvalidTopicModeFallback.test.tsx`
- Modify: `src/pages/superMagic/hooks/__tests__/useTopicMode.test.tsx`
- Modify: `src/pages/superMagic/components/ProjectPageInputContainer/__tests__/ProjectPageInputContainer.test.tsx`
- Modify: `src/pages/superMagic/components/MessageEditor/utils/__tests__/shouldShowInvalidTopicModeFallback.test.ts`

**Interfaces:**

- Produces from `useTopicMode`: `setTopicMode` for explicit user selection and `recoverTopicMode` for runtime-only replacement.
- Produces on `SceneEditorContext`: `recoverTopicMode?: (mode: TopicMode) => void`.
- Consumes: `RoleStore.applyResolvedRole(mode)`.

- [ ] **Step 1: Add failing automatic-recovery tests**

Render `useInvalidTopicModeFallback` with an empty invalid topic and assert:

```typescript
expect(recoverTopicMode).toHaveBeenCalledWith(defaultMode)
expect(setTopicMode).not.toHaveBeenCalled()
```

Keep the pure utility expectations:

```typescript
expect(emptyInvalidTopic).toBe(false)
expect(nonEmptyInvalidTopic).toBe(true)
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```bash
pnpm exec vitest run \
  src/pages/superMagic/components/MessageEditor/hooks/__tests__/useInvalidTopicModeFallback.test.tsx \
  src/pages/superMagic/components/MessageEditor/utils/__tests__/shouldShowInvalidTopicModeFallback.test.ts
```

Expected: the hook calls the persistent `setTopicMode` interface or lacks `recoverTopicMode`.

- [ ] **Step 3: Add the runtime-only action**

Refactor `useTopicMode` around one internal state update and two explicit actions:

```typescript
const recoverTopicMode = useMemoizedFn((mode: TopicMode) => {
	setTopicMode(mode)
	SuperMagicService.topic.syncTopicFrontendModePatch({
		topic: selectedTopic,
		mode,
	})
})

const handleSetTopicMode = useMemoizedFn((mode: TopicMode) => {
	recoverTopicMode(mode)
	if (selectedProject?.workspace_id && selectedProject?.id) {
		ProjectTopicService.setProjectDefaultTopicMode(
			selectedProject.workspace_id,
			selectedProject.id,
			mode,
		)
	}
})
```

Return both actions. Wire `recoverTopicMode` into desktop and mobile editor contexts. On mobile homepage recovery, update the local homepage override and call `roleStore.applyResolvedRole` without persistence.

- [ ] **Step 4: Route automatic callers through recovery**

`useInvalidTopicModeFallback` must call `editorContext.recoverTopicMode`. `useInspectorToolbarMode` must call `roleStore.applyResolvedRole(topicMode)`. Explicit ModeToggle interactions continue using `setTopicMode`.

- [ ] **Step 5: Run focused tests and verify success**

Expected: empty topics recover silently, non-empty topics show fallback, and no automatic path calls the persistent setter.

---

### Task 3: Distinguish Unresolved Availability from an Authoritative Empty List

**Files:**

- Modify: `src/services/superMagic/SuperMagicModeService.ts`
- Modify: `src/pages/superMagic/stores/RoleStore.ts`
- Modify: `src/services/superMagic/__tests__/SuperMagicModeService.test.ts`

**Interfaces:**

- Produces: `SuperMagicModeService.isModeAvailabilityResolved: boolean`
- Consumes: the readiness signal in `RoleStore.resolveRuntimeRole` and its reaction.

- [ ] **Step 1: Add failing RoleStore tests**

Cover both transitions:

```typescript
it("keeps a raw preference before availability resolves", () => {
	expect(store.currentRole).toBe("agent-c")
})

it("falls back after an authoritative empty list removes the stored mode", async () => {
	await superMagicModeService.fetchModeList({ force: true })
	expect(superMagicModeService.modeList).toEqual([])
	expect(store.currentRole).toBe(TopicMode.General)
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
pnpm exec vitest run src/services/superMagic/__tests__/SuperMagicModeService.test.ts
```

Expected: `RoleStore` retains the stale raw preference when the successful response is empty.

- [ ] **Step 3: Add explicit availability readiness**

Add an observable field and getter:

```typescript
_isModeAvailabilityResolved = false

get isModeAvailabilityResolved() {
	return this._isModeAvailabilityResolved
}
```

Set it to `true` when a cached array snapshot is applied and when a current-context API response succeeds, including an empty array. Reset it to `false` when the user/language context resets or no valid cache exists.

- [ ] **Step 4: Make RoleStore consume readiness**

Track readiness in the reaction and preserve raw storage only before resolution:

```typescript
if (rawStored) {
	if (!superMagicModeService.isModeAvailabilityResolved) return rawStored as TopicMode
	if (superMagicModeService.isModeValid(rawStored)) return rawStored as TopicMode
}
```

- [ ] **Step 5: Run focused tests and verify success**

Expected: cached valid preferences survive bootstrap; empty authoritative responses reconcile stale preferences to configured default/general without writing storage.

---

### Task 4: Documentation, Formatting, and Verification

**Files:**

- Modify: `docs/superpowers/specs/default-agent-mode-test-scenarios.md`
- Modify: `src/pages/superMagic/components/MessagePanel/hooks/useMessageQueue.ts:324-326`

**Interfaces:**

- Documents the final empty-topic and mobile Chat terminology.

- [ ] **Step 1: Update the scenario document**

Document that an empty invalid topic uses runtime-only fallback, while a topic with messages shows `TopicInvalidModeFallback`. Clarify that mobile Chat pages are distinct from the unavailable mobile `TopicMode.Chat` selector option.

- [ ] **Step 2: Fix changed-file lint errors**

Format the queue cast as:

```typescript
const topicPattern = messageContent.extra?.super_agent?.topic_pattern as TopicMode | undefined
```

Resolve any new hook dependency warning without suppressing the rule.

- [ ] **Step 3: Run all focused tests**

Run the default-agent matrix from `docs/superpowers/specs/default-agent-mode-test-scenarios.md`, plus:

```bash
pnpm exec vitest run \
  src/pages/superMagic/components/Detail/contents/HTML/iframe-api/hooks/__tests__/useMagicFiles.test.ts \
  src/pages/superMagic/components/MainInputContainer/scenes/__tests__/EditorLayout.test.tsx \
  src/stores/superMagic/__tests__/topicModelStore.test.ts \
  src/pages/superMagicMobile/pages/ChatPage/__tests__/index.test.tsx
```

Expected: zero failed suites and zero failed tests.

- [ ] **Step 4: Run changed-file lint and repository checks**

Run:

```bash
git diff --relative --name-only HEAD -- src |
  rg '\.(ts|tsx)$' |
  xargs pnpm exec eslint --format stylish --report-unused-disable-directives
git diff --check HEAD --
```

Expected: no errors introduced by the current changes. Existing unrelated warnings must be reported separately.

- [ ] **Step 5: Review and commit**

Review `git status`, `git diff`, and recent commit style. If all blocking findings are resolved, stage the relevant files and commit with an English message under 72 characters using the repository Emoji + type convention.
