import { useEffect, useSyncExternalStore } from "react"
import { useMemoizedFn } from "ahooks"
import { useTranslation } from "react-i18next"
import magicToast from "@/components/base/MagicToaster/utils"
import type { FileManagerActions, FileManagerProps } from "../components/FileManager/types"
import { fileManagerTransfer, getFileManagerTransferIds } from "../utils/file-manager-transfer"
import { isDescendantByParentMap, type AttachmentIndex } from "../utils/attachmentIndex"
import type { TopicFilesMenuItem } from "../utils/menu-items"
import type { AttachmentItem } from "./types"
import type { useFileManagerOperations } from "./useFileManagerOperations"

export function useFileManagerCommands({
	props,
	index,
	directoryId,
	selectedIds,
	operations,
	ready,
	onOpen,
	onSelectAll,
}: {
	props: FileManagerProps
	index: AttachmentIndex
	directoryId: string
	selectedIds: Set<string>
	operations: ReturnType<typeof useFileManagerOperations>
	ready: boolean
	onOpen: (file: AttachmentItem) => void
	onSelectAll: () => void
}) {
	const { t } = useTranslation("super")
	const clipboard = useSyncExternalStore(
		fileManagerTransfer.subscribe,
		fileManagerTransfer.getClipboard,
	)
	useEffect(() => {
		fileManagerTransfer.activateIdentity(props.identityKey)
	}, [props.identityKey])
	const ids = getFileManagerTransferIds(selectedIds, index)
	const files = ids.flatMap((id) => {
		const file = index.getItemById(id)
		return file ? [file] : []
	})
	const writable = ready && !operations.busy && Boolean(props.allowEdit)
	const mutableSelection = files.length > 0 && files.every(operations.isMutable)
	const canTransfer = useMemoizedFn(
		(fileIds: string[], targetId: string, mode: "move" | "copy") => {
			if (
				!writable ||
				!fileIds.length ||
				!(mode === "copy" ? operations.capabilities.copy : operations.capabilities.move)
			)
				return false
			if (targetId !== props.rootId && !index.getItemById(targetId)?.is_directory)
				return false
			return fileIds.every((id) => {
				const file = index.getItemById(id)
				return (
					file &&
					(mode === "copy" || operations.isMutable(file)) &&
					id !== targetId &&
					!isDescendantByParentMap(index, id, targetId)
				)
			})
		},
	)
	const transfer = useMemoizedFn((fileIds: string[], targetId: string, mode: "move" | "copy") => {
		const normalized = getFileManagerTransferIds(fileIds, index)
		if (!canTransfer(normalized, targetId, mode)) return
		const changed =
			mode === "copy"
				? normalized
				: normalized.filter(
						(id) => String(index.getItemById(id)?.parent_id ?? "") !== targetId,
					)
		if (!changed.length) return
		void operations
			.transfer(changed, targetId, mode)
			.catch(() => magicToast.error(t("userSpace.operationFailed")))
	})
	const canExecute: FileManagerActions["canExecute"] = (command) => {
		switch (command) {
			case "open":
				return files.length === 1
			case "download":
				return files.length > 0 && props.allowDownload !== false
			case "copy":
				return files.length > 0 && operations.capabilities.copy
			case "rename":
				return writable && mutableSelection && files.length === 1
			case "cut":
			case "move":
				return writable && mutableSelection && operations.capabilities.move
			case "trash":
				return writable && mutableSelection
			case "createFolder":
				return writable
			case "upload":
				return writable && operations.capabilities.upload
			case "paste":
			case "pasteMove":
				return Boolean(
					clipboard &&
					clipboard.scopeKey === props.scopeKey &&
					canTransfer(
						clipboard.fileIds,
						directoryId,
						command === "pasteMove" ? "move" : clipboard.mode,
					),
				)
		}
	}
	const execute = useMemoizedFn<FileManagerActions["execute"]>((command) => {
		if (!canExecute(command)) return
		switch (command) {
			case "open":
				onOpen(files[0])
				break
			case "rename":
				operations.names.rename.handleStartRename(files[0])
				break
			case "createFolder":
				operations.createFolder()
				break
			case "upload":
				operations.uploadFile()
				break
			case "download":
				void operations.batch.handleBatchDownload()
				break
			case "trash":
				void operations.batch.deleteWithConfirm(files)
				break
			case "move":
				operations.moveTo(ids)
				break
			case "cut":
			case "copy":
				fileManagerTransfer.setClipboard({
					scopeKey: props.scopeKey,
					fileIds: ids,
					mode: command === "cut" ? "move" : "copy",
				})
				break
			case "paste":
			case "pasteMove":
				if (clipboard)
					transfer(
						clipboard.fileIds,
						directoryId,
						command === "pasteMove" ? "move" : clipboard.mode,
					)
				break
		}
	})
	const clipboardMenu = (): TopicFilesMenuItem[] => [
		{
			key: "manager-cut",
			label: t("fileManager.cut"),
			disabled: !canExecute("cut"),
			onClick: () => execute("cut"),
		},
		{
			key: "manager-copy",
			label: t("fileManager.copy"),
			disabled: !canExecute("copy"),
			onClick: () => execute("copy"),
		},
		{
			key: "manager-paste",
			label: t("fileManager.paste"),
			disabled: !canExecute("paste"),
			onClick: () => execute("paste"),
		},
	]
	const getMenuItems = (file?: AttachmentItem): TopicFilesMenuItem[] => {
		if (!file)
			return [
				...operations.menu.getBatchDownloadLayerMenuItems(),
				{ type: "divider" },
				...clipboardMenu().slice(2),
				{ key: "manager-selectAll", label: t("userSpace.selectAll"), onClick: onSelectAll },
			]
		const base =
			selectedIds.size > 1
				? [
						...(operations.batch.batchMenuItems ?? []),
						...operations.menu
							.getMenuItems(file)
							.filter(
								(item) =>
									item &&
									["addToCurrentChat", "addToNewChat"].includes(String(item.key)),
							),
					]
				: operations.menu.getMenuItems(file)
		return [...base, { type: "divider" }, ...clipboardMenu()]
	}
	return {
		execute,
		canExecute,
		getMenuItems,
		canTransfer,
		transfer,
		cutIds: new Set(
			clipboard?.scopeKey === props.scopeKey && clipboard.mode === "move"
				? clipboard.fileIds
				: [],
		),
		cancelClipboard: () => {
			if (clipboard?.scopeKey !== props.scopeKey || clipboard.mode !== "move") return false
			fileManagerTransfer.setClipboard(null)
			return true
		},
	}
}
