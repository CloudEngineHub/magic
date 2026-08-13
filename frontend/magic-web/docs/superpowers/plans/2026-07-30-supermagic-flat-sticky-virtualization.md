# SuperMagic MessageList TanStack Flat Sticky Virtualization Plan

> Execution mode: implement in the current `hotfix/message` checkout. Do not stage, commit, push, or alter unrelated worktree state.

## Goal

Virtualize every top-level message returned by `messagesConverter()` with `@tanstack/react-virtual`, while preserving the existing renderer, sticky User message behavior, revoke editing, export/share behavior, streaming updates, pagination intent guards, and canonical Store ownership.

## Confirmed product contracts

- A User message is a normal flat virtual row and the latest User at or before the visible range is retained as the active sticky row.
- Sticky top is `10px` on mobile and `40px` on desktop, with the existing mask and z-index semantics.
- Offscreen streaming rows may unmount; remount reads the latest canonical Store state.
- Semantic interaction state survives virtual unmount. Hover, tooltip, copy feedback, and entry animation may reset.
- Browser Ctrl+F, select-all, and print only cover mounted DOM; export remains data-driven and complete-history.
- Desktop, mobile, share, export, and revoked modes use the same virtual list path.
- Export selection and revoked ownership remain turn-based data sidecars, not DOM containers.
- Acceptance targets include 1000 turns / 5000 items, a long single turn, prepend anchor error <= 2px, P95 frame <= 32ms, and no repeated >100ms long tasks.

## Architecture

1. Add a pure flat projection beside `message-turn-groups.ts`.
    - Produce one item per top-level converted message.
    - Keep stable message key, source index, role, turn key, and sticky-candidate metadata.
    - Produce ordered User indices and a binary-search helper for the active sticky index.
    - Build a TanStack `rangeExtractor` that unions the active User index with the default visible range.
    - Keep `MessageTurnGroup[]` for export/revoked ownership.

2. Add a virtual row renderer.
    - Reuse the Radix `ScrollArea` viewport as `getScrollElement`.
    - Use dynamic measurement through `measureElement` and stable `getItemKey`.
    - Render normal rows absolutely with `translateY(start)`.
    - Render only the active sticky User row with `position: sticky`; do not clone it.
    - Preserve existing row classes, error boundary, tool visibility gate, entry animation metadata, custom children renderer, and export checkbox behavior.
    - Add stable `data-testid` attributes for the virtual canvas and rows.

3. Replace full-DOM scrolling with virtual-aware scrolling.
    - Preserve PubSub scroll-to-bottom and programmatic-scroll suppression.
    - Preserve BackToLatest visibility and bottom follow based on the virtual total size.
    - Preserve explicit wheel/pointer history intent and one page per upward gesture.
    - Before requesting history, capture the first visible stable key and its viewport-relative offset.
    - After prepend and measurement, restore that key and correct residual measurement drift to <= 2px.
    - Reset all scroll transactions on topic change.

4. Preserve semantic view state across virtual unmount.
    - Add a topic/message/control keyed external view-state registry exposed through MessageList context.
    - Migrate stateful controls that would otherwise reset on unmount: reasoning, AgentThink/tool expansion, attachment expansion, KnowledgeSearch expansion, and HTML preview mode/expanded state.
    - Keep Store canonical message facts unchanged and avoid a single parent React object that rerenders all rows.
    - Keep AskUser drafts on their existing persistent cache.

5. Flatten revoked mode into the same virtual item stream.
    - Project the first revoked User as a dedicated editable flat row.
    - Project revoked descendants as individual flat rows.
    - Preserve restore/cancel/send behavior, pending-send visibility barriers, collapsed preview mask/action overlay, and desktop/mobile differences.

6. Preserve export/share behavior.
    - Attach selection UI to User rows using the sidecar `turnKey`.
    - Derive selectable turns and exported content from full data, never mounted DOM.
    - Use the same virtual path in share mode while retaining existing interaction restrictions.

## TDD execution order

1. RED: pure projection and sticky range extraction tests.
2. GREEN: implement flat item projection and active sticky helpers.
3. RED: virtual row test proving only visible rows plus one active User mount, with mobile and desktop sticky offsets.
4. GREEN: implement `VirtualMessageList` and integrate the existing renderer/selection wrappers.
5. RED: virtual scroll tests for bottom follow, PubSub, user-intent pagination, and stable-key prepend restoration.
6. GREEN: implement the virtual-aware scroll controller.
7. RED: unmount/remount tests for semantic interaction state.
8. GREEN: implement keyed view-state registry and migrate affected controls.
9. RED/GREEN: revoked projection and export/share regression tests on the virtual path.
10. Refactor only after focused tests remain green.

## Verification

Run focused Vitest suites with exact paths, then adjacent MessageList tests, TypeScript/lint checks that cover changed files, and `git diff --check`. Document any pre-existing baseline failure separately from implementation regressions. Manually verify desktop/mobile sticky behavior, long streaming content, history prepend, revoke edit, export selection, share mode, and topic switching when a browser environment is available.
