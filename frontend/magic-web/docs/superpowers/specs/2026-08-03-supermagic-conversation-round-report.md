# SuperMagic Conversation Round Report Design

## Goal

Build a reversible conversation-round report format that reads the WebSocket records already stored in IndexedDB, removes duplicate writes caused by multiple browser tabs, aggregates only consecutive Chunk records, preserves real duplicate broadcasts, and restores the cleaned report back into the original per-message流水 for local debugging.

## Boundaries

- `stores/persistence.ts` remains the WebSocket record writer and owns writer metadata plus the asynchronous write barrier.
- `stores/storage.ts` remains a generic Dexie adapter and does not gain report-specific behavior.
- A new `stores/conversation-round-report.ts` module owns IndexedDB querying, report compression/cleaning, and restoration.
- `AssistantCard.tsx` dynamically imports the report module only when the user clicks the report action, keeping Dexie/report code out of the eager MessageList bundle.
- Existing unrelated worktree changes are not reformatted, staged, committed, or rewritten.

## Persisted metadata

Every newly recorded WebSocket value carries:

```ts
interface WebSocketRecordMetadata {
	source: "super_magic_chunk" | "super_magic_message" | "conversation_message"
	writer_id: string
	writer_sequence: number
	received_at: number
	sent_at?: number
}
```

`writer_id` is generated once per page lifecycle. `writer_sequence` increases synchronously for every persisted WebSocket record in that page. Legacy values without these fields are preserved and treated as uncertain rather than heuristically deleted.

## Report ordering

The report is one ordered array. User and complete-message records remain uncompressed apart from removing local `__websocket_record__` metadata. Consecutive Chunk records with the same Topic, app message, and correlation become one `super_magic_chunk` item containing `super_magic_chunks`.

A complete message closes the current Chunk group. Therefore the following arrival flow remains structurally visible:

```text
User -> Chunk group -> Final -> Chunk group -> Final
```

Array position is the report sequence, so no repeated sequence field is emitted. A Chunk group keeps only `app_message_id`, the first `send_time`, `topic_id`, `type`, and ordered `super_magic_chunks`. Each compacted Chunk keeps only `choices`, `correlation_id`, `i`, an optional `send_time` override, and exceptional flags whose value is `true`; normal `false` flags are omitted.

## Multi-tab deduplication

User and complete messages use `message.type + seq_id + app_message_id` as their stable revision identity:

- identical identity and payload: keep one;
- same app message with a different seq: keep both revisions;
- identical identity with different payloads: keep both and mark conflict.

Chunk records use `topic_id + app_message_id + correlation_id + i` plus a stable payload fingerprint. For one payload variant, the cleaned occurrence count is the maximum count observed in any single writer, not the sum across writers. This removes cross-tab multiplication while retaining genuine repeated broadcasts seen by one writer. Repeated retained occurrences after the first receive `duplicate: true`. Different payloads for the same Chunk business key are all retained with `conflict: true`.

Legacy values without `writer_id` are treated as independent uncertain observations and receive `dedupe_uncertain: true`.

## Query and write barrier

`persistMessagesToStorage()` returns/tracks its IndexedDB write promise. The Store exposes a narrow report-only flush method that flushes its in-memory Topic queue and waits for all queued Dexie writes. The report query then reads the Topic table and returns storage IDs with values, sorted by record metadata with storage ID as the deterministic fallback.

## Restoration

`restoreConversationRoundLogs(report)` expands every compacted Chunk group back into individual `SuperMagicChunkMessage`-shaped values, combines them with User/Final records, and preserves the report-array order.

Fields intentionally removed from Chunk restoration are `unread_count`, `created`, completion `id`, `model`, `object`, and local `__websocket_record__` metadata. They are not required to replay the business flow through `receiveChunk()`; content, role, finish reason, choice index, correlation, Chunk index, Topic, app message, and send time remain available.

Restoration never removes retained duplicate broadcasts. It restores the cleaned single-writer-equivalent flow, not the original cross-tab IndexedDB multiplication.

## Error handling

- Missing Topic IDs return an empty query result.
- IndexedDB query failures propagate to the existing UI report handler, which logs the failure without changing Store state.
- Unsupported/unknown persisted values are retained as complete records when they belong to the selected round; they are never silently rewritten as Chunk records.
- Cleaning functions are pure and do not mutate queried values or Store messages.

## Testing

Vitest covers:

- User -> Chunk -> Final -> Chunk -> Final ordering;
- same payload written by two writers collapses once;
- genuine duplicate Chunk counts survive cross-tab collapse;
- conflicting Chunk payloads survive;
- User/Final revision deduplication;
- legacy records remain uncertain and are not deleted;
- compressed Chunk groups restore to individual runtime records;
- query sorting and IndexedDB result unwrapping;
- AssistantCard dynamically loads and reports cleaned values.
