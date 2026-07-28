import type { RawMessage, SuperMagicChunkMessage } from "@/types/chat/intermediate_message"
import type { RawSuperMagicMessageSequence } from "./types"
import { db } from "./storage"

export type PersistableMessage = RawMessage | RawSuperMagicMessageSequence | SuperMagicChunkMessage

let persistenceSequence = 0

export function persistMessagesToStorage(_topicId: string, _values: PersistableMessage[]) {
	if (_values.length === 0) return

	try {
		// Clone the flushed batch once so the asynchronous IndexedDB transaction receives a stable snapshot.
		const entries = _values.map((value) => {
			const cacheId = ("seq_id" in value ? value.seq_id : undefined) || performance.now()
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
