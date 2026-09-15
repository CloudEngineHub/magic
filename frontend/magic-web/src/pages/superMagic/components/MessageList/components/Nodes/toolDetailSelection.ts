import defaultProjectFilesStore from "@/stores/projectFiles"
import pubsub, { PubSubEvents } from "@/utils/pubsub"

// Internal marker: keeps the single-arg callback shape without colliding with tool fields.
const TOOL_DETAIL_SELECTION_TARGET = Symbol("toolDetailSelectionTarget")

type ToolDetailSelectionTarget = "detail" | "file"
type ToolDetail = Record<string, unknown> & {
	[TOOL_DETAIL_SELECTION_TARGET]?: ToolDetailSelectionTarget
}

interface SelectToolDetailOptions {
	detail: Record<string, unknown>
	onSelectDetail?: (detail: ToolDetail) => void
	filesStore?: { workspaceFilesList: Array<{ file_id?: string | number }> }
}

interface SelectSourceFileOptions extends SelectToolDetailOptions {
	fileId: string
}

export function resolveToolFileId(data: unknown): string | undefined {
	if (!data || typeof data !== "object" || Array.isArray(data)) return undefined

	const detailData = data as Record<string, unknown>
	const candidate = detailData.source_file_id
	return typeof candidate === "string" && candidate ? candidate : undefined
}

function isFileInAttachments(
	fileId: string,
	filesStore: NonNullable<SelectToolDetailOptions["filesStore"]>,
): boolean {
	return filesStore.workspaceFilesList.some((item) => String(item.file_id ?? "") === fileId)
}

function markSelectionTarget(
	detail: Record<string, unknown>,
	target: ToolDetailSelectionTarget,
): ToolDetail {
	return { ...detail, isFromNode: true, [TOOL_DETAIL_SELECTION_TARGET]: target }
}

export function getToolDetailSelectionTarget(
	detail: unknown,
): ToolDetailSelectionTarget | undefined {
	if (!detail || typeof detail !== "object" || Array.isArray(detail)) return undefined

	return (detail as ToolDetail)[TOOL_DETAIL_SELECTION_TARGET]
}

/** Opens a file tab only if `fileId` exists in attachments. Returns false to fall back to playback. */
export function selectSourceFileFromTool({
	detail,
	fileId,
	onSelectDetail,
	filesStore = defaultProjectFilesStore,
}: SelectSourceFileOptions): boolean {
	// Runtime artifacts (e.g. browser screenshots) are not workspace files.
	if (!isFileInAttachments(fileId, filesStore)) return false

	pubsub.publish(PubSubEvents.Open_File_Tab, { fileId })
	pubsub.publish(PubSubEvents.Locate_File_In_Tree, fileId)
	onSelectDetail?.(markSelectionTarget(detail, "file"))
	return true
}

export function selectToolDetail({ detail, onSelectDetail }: SelectToolDetailOptions) {
	pubsub.publish(PubSubEvents.Open_Playback_Tab, detail)
	onSelectDetail?.(markSelectionTarget(detail, "detail"))
}
