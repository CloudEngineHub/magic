import type { AICardEntry, AICardHistoryEntry } from "../types"

export interface AICardAttachmentNode {
	file_id?: string
	children?: AICardAttachmentNode[] | null
	created_at?: unknown
	createdAt?: unknown
	created_time?: unknown
	create_time?: unknown
	ctime?: unknown
	birthtime?: unknown
	updated_at?: unknown
}

interface BuildAICardDashboardItemsInput {
	cards: AICardEntry[]
	historyEntries: AICardHistoryEntry[]
	attachmentList?: AICardAttachmentNode[]
}

export interface AICardDashboardItem {
	id: string
	fileId: string
	title: string
	description?: string
	fileName?: string
	createdAt?: string
	kind: "latest" | "history"
	cardId?: string
	historyEntry?: AICardHistoryEntry
}

export function buildAICardDashboardItems({
	cards,
	historyEntries,
	attachmentList,
}: BuildAICardDashboardItemsInput): AICardDashboardItem[] {
	const fileById = buildFileById(attachmentList)
	const latestItems = cards
		.filter((card) => Boolean(card.latestHtmlFileId))
		.map((card) => {
			const fileId = card.latestHtmlFileId || ""
			return {
				id: `latest-${card.id}`,
				fileId,
				title: card.name,
				description: card.description,
				createdAt: resolveFileTime(fileById.get(fileId)) || card.lastUpdated,
				kind: "latest" as const,
				cardId: card.id,
			}
		})
	const historyItems = historyEntries.map((entry) => ({
		id: `history-${entry.fileId}`,
		fileId: entry.fileId,
		title: entry.displayTime,
		fileName: entry.fileName,
		createdAt: entry.timestamp || resolveFileTime(fileById.get(entry.fileId)),
		kind: "history" as const,
		historyEntry: entry,
	}))

	return [
		...latestItems.sort(compareByCreatedAtDesc),
		...historyItems.sort(compareByCreatedAtDesc),
	]
}

function buildFileById(attachmentList?: AICardAttachmentNode[]) {
	const fileById = new Map<string, AICardAttachmentNode>()
	const stack = [...(attachmentList || [])]

	while (stack.length > 0) {
		const node = stack.pop()
		if (!node) continue
		if (node.file_id) fileById.set(node.file_id, node)
		if (node.children?.length) stack.push(...node.children)
	}

	return fileById
}

function resolveFileTime(file?: AICardAttachmentNode) {
	if (!file) return undefined

	return normalizeTimeValue(
		file.created_at ||
			file.createdAt ||
			file.created_time ||
			file.create_time ||
			file.ctime ||
			file.birthtime ||
			file.updated_at,
	)
}

function normalizeTimeValue(value: unknown) {
	if (typeof value === "string") return value
	if (typeof value !== "number") return undefined

	const milliseconds = value < 1_000_000_000_000 ? value * 1000 : value
	return new Date(milliseconds).toISOString()
}

function compareByCreatedAtDesc(left: AICardDashboardItem, right: AICardDashboardItem) {
	const rightTime = Date.parse(right.createdAt || "")
	const leftTime = Date.parse(left.createdAt || "")

	if (Number.isNaN(rightTime) && Number.isNaN(leftTime))
		return left.title.localeCompare(right.title)
	if (Number.isNaN(rightTime)) return -1
	if (Number.isNaN(leftTime)) return 1

	return rightTime - leftTime || left.title.localeCompare(right.title)
}
