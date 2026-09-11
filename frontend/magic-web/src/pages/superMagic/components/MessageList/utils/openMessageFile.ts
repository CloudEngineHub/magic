import pubsub, { PubSubEvents } from "@/utils/pubsub"
import type { FileReference } from "@/apis/modules/superMagic"

interface OpenMessageFileOptions {
	locateInTree?: boolean
}

/** 用户资源单独预览；只有记忆目录继续使用原有记忆编辑 API。 */
export function openUserFileReference(
	reference: Extract<FileReference, { space_type: "user" }>,
): void {
	if (reference.is_directory) return
	const isMemory = reference.space_relative_path.startsWith(".magic/memory/")
	openMessageFile(
		{
			...reference,
			file_reference: reference,
			relative_file_path: "~/" + reference.space_relative_path,
			display_config: {
				previewPolicy: {
					standalone: true,
					editingPresence: false,
					allowShare: false,
					allowVersionHistory: false,
					syncWithAttachments: false,
					persistTab: false,
					restoreAsActive: false,
					...(isMemory ? { fileScope: "memory" } : { readonly: true }),
				},
			},
		},
		{ locateInTree: false },
	)
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
