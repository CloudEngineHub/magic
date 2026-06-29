import pubsub, { PubSubEvents } from "@/utils/pubsub"

interface OpenMessageFileOptions {
	locateInTree?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object")
}

function resolveMessageFileId(fileData: unknown): string | null {
	if (!isRecord(fileData)) return null
	const nestedData = fileData.data
	const fileId =
		fileData.file_id ||
		(isRecord(nestedData) ? nestedData.file_id : undefined) ||
		fileData.currentFileId ||
		fileData.id

	if (typeof fileId === "string" && fileId.trim()) return fileId
	if (typeof fileId === "number" && Number.isFinite(fileId)) return String(fileId)

	return null
}

function isHiddenMessageFile(fileData: unknown): boolean {
	if (!isRecord(fileData)) return false
	const nestedData = fileData.data
	return Boolean(fileData.is_hidden || (isRecord(nestedData) && nestedData.is_hidden))
}

export function openMessageFile(
	fileData: unknown,
	options: OpenMessageFileOptions = {},
): string | null {
	const fileId = resolveMessageFileId(fileData)
	if (!fileId) return null

	pubsub.publish(PubSubEvents.Switch_Detail_Mode, "files")
	pubsub.publish(PubSubEvents.Open_File_Tab, {
		fileId,
		fileData,
	})

	if (options.locateInTree ?? !isHiddenMessageFile(fileData)) {
		pubsub.publish(PubSubEvents.Locate_File_In_Tree, fileId)
	}

	return fileId
}
