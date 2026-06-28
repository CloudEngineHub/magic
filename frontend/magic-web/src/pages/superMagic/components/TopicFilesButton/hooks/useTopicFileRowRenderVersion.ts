import { useMemo } from "react"
import { useMemoizedFn } from "ahooks"
import type { AttachmentItem } from "./types"
import type { VisibleTreeNodeRow } from "../utils/visibleTreeRows"

interface SelectionVersionOptions {
	enabled?: boolean
	isSelectMode?: boolean
	selectedItemsSize: number
	getFolderSelectionState: (item: AttachmentItem) => "none" | "partial" | "all"
	isItemSelected: (itemId: string) => boolean
}

interface ActiveVersionOptions {
	activeFileId?: string | null
	isActiveFileIndexHtml: boolean
	locatingFileId?: string | null
	contextMenuItemId?: string | null
}

interface RenameVersionOptions {
	renamingItemId?: string | null
	renameValue?: string
	renameErrorMessage?: string
	isFileRenaming: (item: AttachmentItem) => boolean
}

interface VirtualEditVersionOptions {
	editingVirtualFileId?: string | null
	virtualFileName?: string
	fileErrorMessage?: string
	editingVirtualFolderId?: string | null
	virtualFolderName?: string
	folderErrorMessage?: string
	editingVirtualDesignProjectId?: string | null
	virtualDesignProjectName?: string
	designProjectErrorMessage?: string
}

interface BusyVersionOptions {
	movingFiles: ReadonlySet<string>
	exportingFiles: ReadonlySet<string>
	downloadingFoldersSize: number
	isFolderDownloading: (item: AttachmentItem) => boolean
}

interface DragVersionOptions {
	isDragging?: boolean
	isExternalDrag?: boolean
	draggingItemsCount: number
}

interface UseTopicFileRowRenderVersionOptions {
	expandedKeySet: ReadonlySet<string>
	selection: SelectionVersionOptions
	active: ActiveVersionOptions
	rename: RenameVersionOptions
	virtualEdit: VirtualEditVersionOptions
	busy: BusyVersionOptions
	drag: DragVersionOptions
}

function toVersionBit(value?: boolean) {
	return value ? 1 : 0
}

function buildVirtualEditState(row: VisibleTreeNodeRow, virtualEdit: VirtualEditVersionOptions) {
	const { node } = row
	const itemId = String(node.key)
	const isVirtualFolder = Boolean(node.item?.is_directory && node.isVirtual)
	const isVirtualDesignProject = virtualEdit.editingVirtualDesignProjectId === itemId
	const isVirtualNormalFolder = isVirtualFolder && !isVirtualDesignProject

	if (!node.isVirtual) return ""

	return [
		isVirtualDesignProject ? virtualEdit.virtualDesignProjectName || "" : "",
		isVirtualDesignProject ? virtualEdit.designProjectErrorMessage || "" : "",
		isVirtualNormalFolder ? virtualEdit.virtualFolderName || "" : "",
		isVirtualNormalFolder ? virtualEdit.folderErrorMessage || "" : "",
		!isVirtualFolder ? virtualEdit.virtualFileName || "" : "",
		!isVirtualFolder ? virtualEdit.fileErrorMessage || "" : "",
	].join(":")
}

function getSelectionState(
	item: AttachmentItem | undefined,
	itemId: string,
	selection: SelectionVersionOptions,
) {
	if (!selection.enabled) return "off"
	if (item?.is_directory) return selection.getFolderSelectionState(item)
	return selection.isItemSelected(itemId) ? "selected" : "none"
}

export function useTopicFileRowRenderVersion({
	expandedKeySet,
	selection,
	active,
	rename,
	virtualEdit,
	busy,
	drag,
}: UseTopicFileRowRenderVersionOptions) {
	const rowRenderContextVersion = useMemo(
		() =>
			[
				toVersionBit(selection.enabled),
				toVersionBit(selection.isSelectMode),
				selection.selectedItemsSize,
				active.activeFileId || "",
				toVersionBit(active.isActiveFileIndexHtml),
				active.locatingFileId || "",
				active.contextMenuItemId || "",
				rename.renamingItemId || "",
				rename.renameValue || "",
				rename.renameErrorMessage || "",
				virtualEdit.editingVirtualFileId || "",
				virtualEdit.virtualFileName || "",
				virtualEdit.fileErrorMessage || "",
				virtualEdit.editingVirtualFolderId || "",
				virtualEdit.virtualFolderName || "",
				virtualEdit.folderErrorMessage || "",
				virtualEdit.editingVirtualDesignProjectId || "",
				virtualEdit.virtualDesignProjectName || "",
				virtualEdit.designProjectErrorMessage || "",
				busy.movingFiles.size,
				busy.exportingFiles.size,
				busy.downloadingFoldersSize,
				toVersionBit(drag.isDragging),
				toVersionBit(drag.isExternalDrag),
				drag.draggingItemsCount,
			].join("|"),
		[
			selection.enabled,
			selection.isSelectMode,
			selection.selectedItemsSize,
			active.activeFileId,
			active.isActiveFileIndexHtml,
			active.locatingFileId,
			active.contextMenuItemId,
			rename.renamingItemId,
			rename.renameValue,
			rename.renameErrorMessage,
			virtualEdit.editingVirtualFileId,
			virtualEdit.virtualFileName,
			virtualEdit.fileErrorMessage,
			virtualEdit.editingVirtualFolderId,
			virtualEdit.virtualFolderName,
			virtualEdit.folderErrorMessage,
			virtualEdit.editingVirtualDesignProjectId,
			virtualEdit.virtualDesignProjectName,
			virtualEdit.designProjectErrorMessage,
			busy.movingFiles.size,
			busy.exportingFiles.size,
			busy.downloadingFoldersSize,
			drag.isDragging,
			drag.isExternalDrag,
			drag.draggingItemsCount,
		],
	)

	const getRowRenderVersion = useMemoizedFn((row: VisibleTreeNodeRow) => {
		const { node } = row
		const item = node.item
		const itemId = String(node.key)
		const fileId = item?.file_id || ""
		const renameState =
			rename.renamingItemId === itemId
				? `${rename.renameValue || ""}:${rename.renameErrorMessage || ""}`
				: ""

		return [
			fileId,
			toVersionBit(expandedKeySet.has(itemId)),
			getSelectionState(item, itemId, selection),
			toVersionBit(active.locatingFileId === fileId),
			toVersionBit(active.contextMenuItemId === itemId),
			renameState,
			toVersionBit(Boolean(item && rename.isFileRenaming(item))),
			toVersionBit(busy.movingFiles.has(fileId)),
			toVersionBit(busy.exportingFiles.has(fileId)),
			toVersionBit(Boolean(item?.is_directory && busy.isFolderDownloading(item))),
			buildVirtualEditState(row, virtualEdit),
		].join("|")
	})

	return { getRowRenderVersion, rowRenderContextVersion }
}
