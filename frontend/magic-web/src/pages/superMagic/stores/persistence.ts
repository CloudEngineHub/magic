import type { RawMessage, SuperMagicChunkMessage } from "@/types/chat/intermediate_message"
import { createRandomUuidV4 } from "@/utils/create-random-uuid-v4"
import type { RawSuperMagicMessageSequence } from "./types"
import { db } from "./storage"

export const WEBSOCKET_RECORD_METADATA_KEY = "__websocket_record__" as const

export type WebSocketRecordSource =
	"super_magic_chunk" | "super_magic_message" | "conversation_message"

export interface WebSocketRecordMetadata {
	source: WebSocketRecordSource
	writer_id: string
	writer_sequence: number
	received_at: number
	sent_at?: number
}

type RawPersistableMessage = RawMessage | RawSuperMagicMessageSequence | SuperMagicChunkMessage

export type PersistableMessage = RawPersistableMessage & {
	[WEBSOCKET_RECORD_METADATA_KEY]?: WebSocketRecordMetadata
}

let persistenceSequence = 0
const websocketRecordWriterId = createRandomUuidV4()
let websocketRecordWriterSequence = 0
let messagePersistenceBarrier = Promise.resolve()

export function createWebSocketRecordMetadata(
	source: WebSocketRecordSource,
	sentAt?: number,
): WebSocketRecordMetadata {
	return {
		source,
		writer_id: websocketRecordWriterId,
		writer_sequence: websocketRecordWriterSequence++,
		received_at: Date.now(),
		...(typeof sentAt === "number" ? { sent_at: sentAt } : {}),
	}
}

export function getWebSocketRecordWriterId(): string {
	return websocketRecordWriterId
}

/** 等待当前页面已经提交的写入全部落盘，避免上报查询抢在最后一个批次之前。 */
export function waitForMessagePersistence(): Promise<void> {
	return messagePersistenceBarrier
}

export function persistMessagesToStorage(
	_topicId: string,
	_values: PersistableMessage[],
): Promise<void> {
	if (_values.length === 0) return Promise.resolve()

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
		const write = db.addManyToTable(_topicId, parsedEntries).catch((error) => {
			console.log(error)
		})
		// 每次调用立即提交给 Dexie，同时让报告查询能等待所有尚未完成的并发写入。
		messagePersistenceBarrier = Promise.all([messagePersistenceBarrier, write]).then(
			() => undefined,
			() => undefined,
		)
		return write
	} catch (error) {
		console.log(error)
		return Promise.resolve()
	}
}

export function persistMessageToStorage(
	_topicId: string,
	_value: PersistableMessage,
	_debugMode?: boolean,
) {
	persistMessagesToStorage(_topicId, [_value])
}
