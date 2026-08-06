import { db } from "./storage"
import { WEBSOCKET_RECORD_METADATA_KEY, type WebSocketRecordMetadata } from "./persistence"
import type { MessageItem } from "./types"

export { getWebSocketRecordWriterId as getConversationRoundReportWriterId } from "./persistence"

type JsonRecord = Record<string, any>

export interface StoredConversationRoundRecord {
	storageId: string
	value: JsonRecord
}

interface ConversationRoundMessageReportItem extends JsonRecord {
	conflict?: true
	message: JsonRecord
}

export interface CompressedConversationRoundChunk {
	send_time?: number
	i: number
	choices: JsonRecord[]
	correlation_id: string
	duplicate?: true
	conflict?: true
	dedupe_uncertain?: boolean
}

export interface ConversationRoundChunkReportItem {
	type: "super_magic_chunk"
	app_message_id: string
	send_time?: number
	topic_id: string
	super_magic_chunks: CompressedConversationRoundChunk[]
}

export type ConversationRoundReportItem =
	ConversationRoundMessageReportItem | ConversationRoundChunkReportItem

interface CompressConversationRoundLogsInput {
	records: StoredConversationRoundRecord[]
	roundMessages: Array<Partial<MessageItem> & JsonRecord>
	preferredWriterId?: string
}

interface SelectedRecord extends StoredConversationRoundRecord {
	conflict?: boolean
	duplicate?: boolean
	dedupeUncertain?: boolean
}

function cloneJson<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T
}

function stableStringify(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`

	const record = value as JsonRecord
	return `{${Object.keys(record)
		.filter((key) => record[key] !== undefined)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
		.join(",")}}`
}

function getMetadata(value: JsonRecord): Partial<WebSocketRecordMetadata> {
	return value?.[WEBSOCKET_RECORD_METADATA_KEY] || {}
}

function getWriterId(record: StoredConversationRoundRecord): string {
	return getMetadata(record.value).writer_id || `legacy:${record.storageId}`
}

function isLegacyRecord(record: StoredConversationRoundRecord): boolean {
	return !getMetadata(record.value).writer_id
}

function getReceivedAt(record: StoredConversationRoundRecord): number {
	const receivedAt = getMetadata(record.value).received_at
	return typeof receivedAt === "number" ? receivedAt : 0
}

function compareStoredRecords(
	left: StoredConversationRoundRecord,
	right: StoredConversationRoundRecord,
) {
	const receivedOrder = getReceivedAt(left) - getReceivedAt(right)
	if (receivedOrder) return receivedOrder

	const leftWriterSequence = getMetadata(left.value).writer_sequence
	const rightWriterSequence = getMetadata(right.value).writer_sequence
	if (
		typeof leftWriterSequence === "number" &&
		typeof rightWriterSequence === "number" &&
		leftWriterSequence !== rightWriterSequence
	) {
		return leftWriterSequence - rightWriterSequence
	}

	return left.storageId.localeCompare(right.storageId)
}

function getMessageNode(value: JsonRecord): JsonRecord {
	const message = value?.message
	if (!message || typeof message !== "object") return {}
	const messageType = message.type
	return messageType && typeof message[messageType] === "object" ? message[messageType] : {}
}

function createRoundScope(roundMessages: CompressConversationRoundLogsInput["roundMessages"]) {
	const appMessageIds = new Set<string>()
	const superMessageIds = new Set<string>()
	const correlationIds = new Set<string>()

	for (const message of roundMessages) {
		if (message.app_message_id) appMessageIds.add(String(message.app_message_id))
		if (message.super_message_id) superMessageIds.add(String(message.super_message_id))
		if (message.correlation_id) correlationIds.add(String(message.correlation_id))
		const debug = message.debug as JsonRecord | undefined
		if (debug?.super_message_id) superMessageIds.add(String(debug.super_message_id))
		if (debug?.correlation_id) correlationIds.add(String(debug.correlation_id))
	}

	return { appMessageIds, superMessageIds, correlationIds }
}

function belongsToRound(
	record: StoredConversationRoundRecord,
	scope: ReturnType<typeof createRoundScope>,
) {
	const value = record.value
	if (value?.type === "super_magic_chunk") {
		const chunk = value.super_magic_chunk || {}
		return (
			scope.appMessageIds.has(String(value.app_message_id || "")) ||
			scope.superMessageIds.has(String(chunk.super_message_id || "")) ||
			scope.correlationIds.has(String(chunk.correlation_id || ""))
		)
	}

	const message = value?.message || {}
	const node = getMessageNode(value)
	return (
		scope.appMessageIds.has(String(message.app_message_id || "")) ||
		scope.superMessageIds.has(String(node.super_message_id || "")) ||
		scope.correlationIds.has(String(node.correlation_id || ""))
	)
}

function payloadFingerprint(value: JsonRecord) {
	const payload = cloneJson(value)
	delete payload[WEBSOCKET_RECORD_METADATA_KEY]
	return stableStringify(payload)
}

function getCompleteMessageIdentity(value: JsonRecord) {
	return [
		value?.message?.type || "unknown",
		value?.seq_id || "",
		value?.message?.app_message_id || "",
	].join("|")
}

function getChunkBusinessKey(value: JsonRecord) {
	const chunk = value?.super_magic_chunk || {}
	return [
		value?.topic_id || "",
		value?.app_message_id || "",
		chunk?.correlation_id || "",
		chunk?.i ?? "",
	].join("|")
}

function choosePreferredRecord(
	records: StoredConversationRoundRecord[],
	preferredWriterId?: string,
) {
	return (
		records.find((record) => getWriterId(record) === preferredWriterId) ||
		records.slice().sort(compareStoredRecords)[0]
	)
}

function deduplicateCompleteMessages(
	records: StoredConversationRoundRecord[],
	preferredWriterId?: string,
): SelectedRecord[] {
	const identities = new Map<string, Map<string, StoredConversationRoundRecord[]>>()

	for (const record of records) {
		const identity = getCompleteMessageIdentity(record.value)
		const fingerprint = payloadFingerprint(record.value)
		const variants =
			identities.get(identity) || new Map<string, StoredConversationRoundRecord[]>()
		const copies = variants.get(fingerprint) || []
		copies.push(record)
		variants.set(fingerprint, copies)
		identities.set(identity, variants)
	}

	const selected: SelectedRecord[] = []
	for (const variants of identities.values()) {
		const conflict = variants.size > 1
		for (const copies of variants.values()) {
			const chosen = choosePreferredRecord(copies, preferredWriterId)
			if (chosen) selected.push({ ...chosen, conflict })
		}
	}
	return selected
}

function deduplicateChunks(
	records: StoredConversationRoundRecord[],
	preferredWriterId?: string,
): SelectedRecord[] {
	const businessGroups = new Map<string, Map<string, StoredConversationRoundRecord[]>>()

	for (const record of records) {
		const businessKey = getChunkBusinessKey(record.value)
		const fingerprint = payloadFingerprint(record.value)
		const variants =
			businessGroups.get(businessKey) || new Map<string, StoredConversationRoundRecord[]>()
		const observations = variants.get(fingerprint) || []
		observations.push(record)
		variants.set(fingerprint, observations)
		businessGroups.set(businessKey, variants)
	}

	const selected: SelectedRecord[] = []
	for (const variants of businessGroups.values()) {
		const conflict = variants.size > 1
		for (const observations of variants.values()) {
			const legacyObservations = observations
				.filter(isLegacyRecord)
				.sort(compareStoredRecords)
			legacyObservations.forEach((observation, occurrenceIndex) => {
				selected.push({
					...observation,
					duplicate: occurrenceIndex > 0,
					conflict,
					dedupeUncertain: true,
				})
			})

			const byWriter = new Map<string, StoredConversationRoundRecord[]>()
			for (const observation of observations
				.filter((item) => !isLegacyRecord(item))
				.sort(compareStoredRecords)) {
				const writerId = getWriterId(observation)
				const writerRecords = byWriter.get(writerId) || []
				writerRecords.push(observation)
				byWriter.set(writerId, writerRecords)
			}
			if (byWriter.size === 0) continue

			const occurrenceCount = Math.max(
				...Array.from(byWriter.values(), (items) => items.length),
			)
			for (let occurrenceIndex = 0; occurrenceIndex < occurrenceCount; occurrenceIndex += 1) {
				const preferred = preferredWriterId
					? byWriter.get(preferredWriterId)?.[occurrenceIndex]
					: undefined
				const fallback = Array.from(byWriter.values())
					.map((items) => items[occurrenceIndex])
					.filter(Boolean)
					.sort(compareStoredRecords)[0]
				const chosen = preferred || fallback
				if (!chosen) continue

				selected.push({
					...chosen,
					duplicate: occurrenceIndex > 0,
					conflict,
					dedupeUncertain: isLegacyRecord(chosen),
				})
			}
		}
	}

	return selected
}

function createChunkGroup(record: SelectedRecord) {
	const value = record.value
	const item: ConversationRoundChunkReportItem = {
		type: "super_magic_chunk",
		app_message_id: String(value.app_message_id || ""),
		...(typeof value.send_time === "number" ? { send_time: value.send_time } : {}),
		topic_id: String(value.topic_id || ""),
		super_magic_chunks: [],
	}
	return item
}

function getChunkGroupKey(record: SelectedRecord) {
	const value = record.value
	const chunk = value.super_magic_chunk || {}
	return [value.topic_id || "", value.app_message_id || "", chunk.correlation_id || ""].join("|")
}

function appendChunk(group: ConversationRoundChunkReportItem, record: SelectedRecord) {
	const value = record.value
	const chunk = value.super_magic_chunk || {}
	group.super_magic_chunks.push({
		...(typeof value.send_time === "number" && value.send_time !== group.send_time
			? { send_time: value.send_time }
			: {}),
		i: Number(chunk.i || 0),
		choices: cloneJson(chunk.choices || []),
		correlation_id: String(chunk.correlation_id || ""),
		...(record.duplicate ? { duplicate: true as const } : {}),
		...(record.conflict ? { conflict: true as const } : {}),
		...(record.dedupeUncertain ? { dedupe_uncertain: true } : {}),
	})
}

export async function queryConversationRoundLogs(
	topicId: string,
): Promise<StoredConversationRoundRecord[]> {
	if (!topicId) return []
	const values = await db.queryAllFromTable(topicId)
	return values
		.map(({ id, value }) => ({ storageId: id, value: value as JsonRecord }))
		.sort(compareStoredRecords)
}

export function compressConversationRoundLogs({
	records,
	roundMessages,
	preferredWriterId,
}: CompressConversationRoundLogsInput): ConversationRoundReportItem[] {
	const scope = createRoundScope(roundMessages)
	const scopedRecords = records.filter((record) => belongsToRound(record, scope))
	const chunks = scopedRecords.filter((record) => record.value?.type === "super_magic_chunk")
	const completeMessages = scopedRecords.filter(
		(record) => record.value?.type !== "super_magic_chunk" && record.value?.message,
	)
	const timeline = [
		...deduplicateChunks(chunks, preferredWriterId),
		...deduplicateCompleteMessages(completeMessages, preferredWriterId),
	].sort(compareStoredRecords)

	const report: ConversationRoundReportItem[] = []
	let currentChunkGroup: ConversationRoundChunkReportItem | undefined
	let currentChunkGroupKey = ""

	const flushChunkGroup = () => {
		if (currentChunkGroup) report.push(currentChunkGroup)
		currentChunkGroup = undefined
		currentChunkGroupKey = ""
	}

	timeline.forEach((record) => {
		if (record.value?.type === "super_magic_chunk") {
			const nextGroupKey = getChunkGroupKey(record)
			if (!currentChunkGroup || nextGroupKey !== currentChunkGroupKey) {
				flushChunkGroup()
				currentChunkGroup = createChunkGroup(record)
				currentChunkGroupKey = nextGroupKey
			}
			appendChunk(currentChunkGroup, record)
			return
		}

		flushChunkGroup()
		const value = cloneJson(record.value)
		delete value[WEBSOCKET_RECORD_METADATA_KEY]
		report.push({
			...value,
			...(record.conflict ? { conflict: true as const } : {}),
		} as ConversationRoundMessageReportItem)
	})
	flushChunkGroup()

	return report
}

export function restoreConversationRoundLogs(report: ConversationRoundReportItem[]): JsonRecord[] {
	const restored: JsonRecord[] = []

	for (const item of report) {
		if (item.type !== "super_magic_chunk") {
			const value = cloneJson(item)
			delete value.conflict
			restored.push(value)
			continue
		}

		for (const chunk of item.super_magic_chunks) {
			const value = {
				app_message_id: item.app_message_id,
				...(typeof chunk.send_time === "number"
					? { send_time: chunk.send_time }
					: typeof item.send_time === "number"
						? { send_time: item.send_time }
						: {}),
				topic_id: item.topic_id,
				type: "super_magic_chunk",
				super_magic_chunk: {
					choices: cloneJson(chunk.choices),
					correlation_id: chunk.correlation_id,
					i: chunk.i,
				},
			}
			restored.push(value)
		}
	}

	return restored
}
