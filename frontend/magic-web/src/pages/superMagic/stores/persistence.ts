import type { RawMessage, SuperMagicChunkMessage } from "@/types/chat/intermediate_message"
import type { RawSuperMagicMessageSequence } from "./types"
import { db } from "./storage"

export const WEBSOCKET_RECORD_METADATA_KEY = "__websocket_record__" as const

export type WebSocketRecordSource = "super_magic_chunk" | "super_magic_message"

export interface WebSocketRecordMetadata {
	source: WebSocketRecordSource
	received_at: number
	sent_at?: number
}

type RawPersistableMessage = RawMessage | RawSuperMagicMessageSequence | SuperMagicChunkMessage

export type PersistableMessage = RawPersistableMessage & {
	[WEBSOCKET_RECORD_METADATA_KEY]?: WebSocketRecordMetadata
}

let persistenceSequence = 0

export function persistMessagesToStorage(_topicId: string, _values: PersistableMessage[]) {
	if (_values.length === 0) return

	try {
		// Clone the flushed batch once so the asynchronous IndexedDB transaction receives a stable snapshot.
		const entries = _values.map((value) => {
			const websocketRecord = value[WEBSOCKET_RECORD_METADATA_KEY]
			const cacheId = websocketRecord
				? websocketRecord.received_at
				: ("seq_id" in value ? value.seq_id : undefined) || performance.now()
			return {
				id: `${cacheId}-${persistenceSequence++}`,
				value,
			}
		})
		const parsedEntries = JSON.parse(JSON.stringify(entries))
		void db.addManyToTable(_topicId, parsedEntries).catch((error) => {
			console.log(error)
		})
	} catch (error) {
		console.log(error)
	}
}

export function persistMessageToStorage(
	_topicId: string,
	_value: PersistableMessage,
	_debugMode?: boolean,
) {
	persistMessagesToStorage(_topicId, [_value])
}
