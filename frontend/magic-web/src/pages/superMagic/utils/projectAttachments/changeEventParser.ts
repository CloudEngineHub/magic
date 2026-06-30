import type { SeqResponse } from "@/types/request"
import type {
	SuperMagicFileChangeItem,
	SuperMagicFileChangeMessage,
} from "@/types/chat/intermediate_message"

// Lightweight parser: extracts file-change fields from seq without logs or side effects.
// Reuse this parsing for realtime validation, logging, and dedupe keys.
export interface ParsedProjectAttachmentsChangeEvent {
	seq: SeqResponse<SuperMagicFileChangeMessage>
	messageData?: SuperMagicFileChangeMessage
	projectId?: string
	workspaceId?: string
	topicId?: string
	timestamp?: string
	seqId?: string
	messageId?: string
	changes: SuperMagicFileChangeItem[]
	refreshParentIds: string[]
	changeCount: number
	dedupeKey: string
}

function normalizeRefreshParentIds(ids: unknown) {
	if (!Array.isArray(ids)) return []
	const seen = new Set<string>()
	const result: string[] = []
	for (const id of ids) {
		const normalizedId = id === null || id === undefined ? "" : String(id)
		if (!normalizedId || seen.has(normalizedId)) continue
		seen.add(normalizedId)
		result.push(normalizedId)
	}
	return result
}

function buildChangesDedupeKey(changes: SuperMagicFileChangeItem[]) {
	return changes
		.map((change) => `${change.operation}:${change.file_id || change.file?.file_id || ""}`)
		.join("|")
}

export function getProjectAttachmentsChangeDedupeKey(
	seq: SeqResponse<SuperMagicFileChangeMessage>,
) {
	// Prefer stable server seq/message IDs; build a content key only as fallback.
	const directKey = seq?.seq_id || seq?.message_id
	if (directKey) return directKey

	const messageData = seq?.message
	if (!messageData) return "missing-message"

	const changes = Array.isArray(messageData.changes) ? messageData.changes : []
	const refreshParentIds = normalizeRefreshParentIds(messageData.refresh_parent_ids)
	return `${messageData.project_id}:${messageData.timestamp}:${buildChangesDedupeKey(changes)}:${refreshParentIds.join("|")}`
}

export function parseProjectAttachmentsChangeEvent(
	seq: SeqResponse<SuperMagicFileChangeMessage>,
): ParsedProjectAttachmentsChangeEvent {
	const messageData = seq?.message
	// Normalize changes here so later validation only checks changeCount.
	const changes = Array.isArray(messageData?.changes) ? messageData.changes : []
	const refreshParentIds = normalizeRefreshParentIds(messageData?.refresh_parent_ids)

	return {
		seq,
		messageData,
		projectId: messageData?.project_id,
		workspaceId: messageData?.workspace_id,
		topicId: messageData?.topic_id,
		timestamp: messageData?.timestamp,
		seqId: seq?.seq_id,
		messageId: seq?.message_id,
		changes,
		refreshParentIds,
		changeCount: changes.length,
		dedupeKey: getProjectAttachmentsChangeDedupeKey(seq),
	}
}

export function getProjectAttachmentsChangeEventLogData(
	seq: SeqResponse<SuperMagicFileChangeMessage>,
) {
	const parsedEvent = parseProjectAttachmentsChangeEvent(seq)
	return {
		message_project_id: parsedEvent.projectId,
		workspace_id: parsedEvent.workspaceId,
		topic_id: parsedEvent.topicId,
		seq_id: parsedEvent.seqId,
		message_id: parsedEvent.messageId,
		timestamp: parsedEvent.timestamp,
		change_count: parsedEvent.changeCount,
		refresh_parent_ids: parsedEvent.refreshParentIds,
	}
}
