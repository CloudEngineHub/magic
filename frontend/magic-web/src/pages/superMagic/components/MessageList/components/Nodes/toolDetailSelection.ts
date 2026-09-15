import projectFilesStore from "@/stores/projectFiles"
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
<<<<<<< Updated upstream
	const candidate = detailData.source_file_id
	return typeof candidate === "string" && candidate ? candidate : undefined
=======
	const candidate = [detailData.source_file_id, detailData.target_file_id].find(
		(value): value is string => typeof value === "string" && value.length > 0,
	)
	return candidate
}

export function getToolCardInteractionTarget(
	toolName: string | undefined,
	detail: unknown,
): ToolCardInteractionTarget {
	if (
		!detail ||
		typeof detail !== "object" ||
		Array.isArray(detail) ||
		Object.keys(detail).length === 0
	) {
		return { type: "disabled" }
	}
	if (toolName && DisabledDetailToolTypes.includes(toolName)) {
		return { type: "disabled" }
	}
	if (toolName && DESIGN_TOOL_NAMES.has(toolName)) {
		return { type: "design" }
	}

	const detailRecord = detail as Record<string, unknown>
	if (detailRecord.type === "browser") {
		return { type: "playback" }
	}
	const data = detailRecord.data
	if (data && typeof data === "object" && !Array.isArray(data)) {
		const { target_file_id, target_file_path } = data as Record<string, unknown>
		const fileId =
			typeof target_file_id === "string" && target_file_id ? target_file_id : undefined
		const filePath =
			typeof target_file_path === "string" && target_file_path ? target_file_path : undefined
		if (fileId || filePath) return { type: "file-reference", fileId, filePath }
	}
	const fileId = resolveToolFileId(detailRecord.data)
	return fileId ? { type: "file", fileId } : { type: "playback" }
}

let pendingFileSelection: AbortController | null = null

/** 两种消息卡片共用真实目标解析。 */
export function selectToolFile({
	detail,
	target,
	onSelectDetail,
}: SelectToolDetailOptions & {
	target: ToolCardInteractionTarget
}): boolean {
	if (target.type === "file")
		return selectSourceFileFromTool({ detail, fileId: target.fileId, onSelectDetail })
	if (target.type !== "file-reference") return false
	pendingFileSelection?.abort()
	void selectReferencedToolFile({ detail, target, onSelectDetail })
	return true
}

async function selectReferencedToolFile({
	detail,
	target,
	onSelectDetail,
}: SelectToolDetailOptions & {
	target: Extract<ToolCardInteractionTarget, { type: "file-reference" }>
}): Promise<void> {
	const controller = new AbortController()
	pendingFileSelection = controller
	const identity = getFileReferenceIdentityKey()
	const projectId = projectFilesStore.currentSelectedProject?.id
	const cancel = () => controller.abort()
	const disposeIdentity = reaction(
		() => [getFileReferenceIdentityKey(), projectFilesStore.currentSelectedProject?.id],
		cancel,
	)
	const selectionEvents = [
		PubSubEvents.Open_File_Tab,
		PubSubEvents.Open_Playback_Tab,
		PubSubEvents.Update_Active_File_Id,
	] as const
	selectionEvents.forEach((event) => pubsub.subscribe(event, cancel))
	const release = () => {
		disposeIdentity()
		selectionEvents.forEach((event) => pubsub.unsubscribe(event, cancel))
		if (pendingFileSelection === controller) pendingFileSelection = null
	}
	try {
		let reference: FileReference | undefined
		let file: Awaited<ReturnType<typeof resolveReferencedProjectAttachment>> | undefined
		if (target.fileId) {
			const result = await resolveFileReference({ file_id: target.fileId }, controller.signal)
			if (result.status === "resolved") reference = result.reference
		} else if (target.filePath) {
			// 工具传回实际 POSIX 路径；只在 href 边界编码一次，百分号属于文件名。
			const pathTarget = classifyMarkdownFileHref(
				target.filePath.split("/").map(encodeURIComponent).join("/"),
			).target
			if (pathTarget?.scope === "user") {
				const result = await resolveFileReference(
					{ space_type: "user", space_relative_path: pathTarget.relativePath },
					controller.signal,
				)
				if (result.status === "resolved") reference = result.reference
			} else if (pathTarget?.scope === "workspace" && projectId) {
				const attachment = findAttachmentByPath(
					projectFilesStore.workspaceFilesList,
					pathTarget.relativePath,
				)
				if (attachment)
					file = {
						...attachment,
						project_id: projectId,
						relative_file_path: pathTarget.relativePath,
					}
			} else if (pathTarget?.scope === "referenced-project") {
				file = await resolveReferencedProjectAttachment(pathTarget)
			}
		}
		if (reference?.space_type === "project" && !reference.is_directory) {
			// ID 已完成鉴权；直接使用其元信息，不再通过同路径查找另一个目标。
			const attachment = projectFilesStore.workspaceFilesList.find(
				(item) => String(item.file_id) === reference.file_id,
			)
			file = {
				...attachment,
				...reference,
				relative_file_path: reference.space_relative_path,
				display_config: {
					...attachment?.display_config,
					previewPolicy: {
						...attachment?.display_config?.previewPolicy,
						standalone: true,
					},
				},
			}
		}
		if (
			controller.signal.aborted ||
			identity !== getFileReferenceIdentityKey() ||
			projectId !== projectFilesStore.currentSelectedProject?.id
		)
			return
		release()
		if (reference?.space_type === "user" && !reference.is_directory) {
			openUserFileReference(reference)
		} else if (file && !file.is_directory && file.type !== "directory") {
			openMessageFile(
				file.project_id === projectId ? file : createReferencedProjectPreviewFile(file),
				{ locateInTree: file.project_id === projectId },
			)
		} else {
			magicToast.error(i18n.t("super:common.fileNotFoundOrLoadFailed"))
			return
		}
		onSelectDetail?.(markSelectionTarget(detail, "file"))
	} catch {
		if (!controller.signal.aborted && identity === getFileReferenceIdentityKey())
			magicToast.error(i18n.t("super:common.fileNotFoundOrLoadFailed"))
	} finally {
		release()
	}
>>>>>>> Stashed changes
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

/** Opens a workspace file tab for `source_file_id`. Browser artifacts stay on playback via card target. */
export function selectSourceFileFromTool({
	detail,
	fileId,
	onSelectDetail,
}: SelectSourceFileOptions): boolean {
	if (!fileId) return false

	pubsub.publish(PubSubEvents.Open_File_Tab, { fileId })
	pubsub.publish(PubSubEvents.Locate_File_In_Tree, fileId)
	onSelectDetail?.(markSelectionTarget(detail, "file"))
	return true
}

export function selectToolDetail({ detail, onSelectDetail }: SelectToolDetailOptions) {
	pubsub.publish(PubSubEvents.Open_Playback_Tab, detail)
	onSelectDetail?.(markSelectionTarget(detail, "detail"))
}
