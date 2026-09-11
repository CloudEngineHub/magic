import { useEffect, useRef, useState } from "react"
import { useMemoizedFn } from "ahooks"
import { useTranslation } from "react-i18next"
import { MagicFSApi, type MagicFSFile } from "@/apis"
import magicToast from "@/components/base/MagicToaster/utils"
import userFilesStore from "@/stores/userFiles"
import { useFileInfoPanel } from "../../TopicFilesButton/hooks/useFileInfoPanel"
import {
	useUploadWithModal,
	type UploadTarget,
} from "../../TopicFilesButton/hooks/useUploadWithModal"
import { useFileOperations } from "../../TopicFilesButton/hooks/useFileOperations"
import { useVirtualFile } from "../../TopicFilesButton/hooks/useVirtualFile"
import { useVirtualFolder } from "../../TopicFilesButton/hooks/useVirtualFolder"
import { useRename } from "../../TopicFilesButton/hooks/useRename"
import { useMoveFile } from "../../TopicFilesButton/hooks/useMoveFile"
import { useBatchDownload } from "../../TopicFilesButton/hooks/useBatchDownload"
import { useContextMenu } from "../../TopicFilesButton/hooks/useContextMenu"
import { createFileMenuItems } from "../../TopicFilesButton/components/hooks/useFileMenuItems"
import { getAttachmentKey } from "../../TopicFilesButton/utils/getAttachmentKey"
import type { AttachmentItem } from "../../TopicFilesButton/hooks/types"
import type { PresetFileType } from "../../TopicFilesButton/constant"
import { addFileToCurrentChat } from "../../../utils/topics"
import { getFileReferenceIdentityKey } from "../../../services/userFileReferenceResolver"
import { isFixedUserMemoryEntry } from "../../LongTremMemory/components/memoryTreeNodeUtils"
import { toUserAttachment } from "../services/userSpaceFileService"

export function useUserSpaceFileActions(options: {
	items: AttachmentItem[]
	resolveParent: () => Promise<MagicFSFile>
	viewKey: string
	onOpen?: (file: AttachmentItem) => void
	onNavigate: (id?: string) => void
	topicId?: string | null
}) {
	const { t } = useTranslation("super")
	const identity = getFileReferenceIdentityKey()
	const viewKey = options.viewKey
	const currentView = useRef(viewKey)
	currentView.current = viewKey
	useEffect(() => {
		currentView.current = viewKey
		return () => {
			currentView.current = ""
		}
	}, [viewKey])
	const isCurrent = () => Boolean(identity) && identity === getFileReferenceIdentityKey()
	const assertCurrent = () => {
		if (!isCurrent()) throw new DOMException("File operation cancelled", "AbortError")
	}
	const [selection, setSelection] = useState<Set<string>>(new Set())
	const info = useFileInfoPanel()
	const isSelectable = (file: AttachmentItem) =>
		Boolean(file.file_id) &&
		!isFixedUserMemoryEntry(
			file.file_reference?.space_relative_path ?? file.relative_file_path ?? "",
			Boolean(file.is_directory),
		)
	const attachment = (file: MagicFSFile) =>
		toUserAttachment(
			file,
			userFilesStore
				.getPath(file.id)
				.map((node) => node.name)
				.join("/"),
		)
	const refresh = (parents: Array<string | null | undefined>) => {
		if (!isCurrent()) return
		userFilesStore.notifyMutation()
		void Promise.all(
			[...new Set(parents.filter((id): id is string => Boolean(id)))].map((id) =>
				userFilesStore.loadDirectory(id, true),
			),
		).catch(() => {
			if (isCurrent()) magicToast.error(t("userSpace.refreshAfterChangeFailed"))
		})
	}
	const open = useMemoizedFn((file: AttachmentItem) => {
		if (!file.is_directory) options.onOpen?.(file)
	})
	const addToChat = useMemoizedFn(async (file: AttachmentItem) => {
		if (!options.topicId) {
			magicToast.info(t("userSpace.openChatFirst"))
			return
		}
		try {
			assertCurrent()
			await addFileToCurrentChat({ fileItem: file, autoFocus: true })
		} catch {
			if (isCurrent()) magicToast.error(t("common.fileNotFoundOrLoadFailed"))
		}
	})
	const createParent = useRef<{ resolve: () => Promise<MagicFSFile>; id?: string } | null>(null)
	const operations = useFileOperations({
		fileScope: "user",
		attachments: options.items,
		isCurrent,
		resolveCreateParent: async () => {
			assertCurrent()
			const source = createParent.current
			if (!source) throw new Error("Create target is unavailable")
			const parent = await source.resolve()
			assertCurrent()
			source.id = parent.id
			return parent.id
		},
		onUpdateAttachments: () => refresh([createParent.current?.id]),
		onFileCreated: (file: AttachmentItem) => {
			void userFilesStore
				.loadDirectory(file.parent_id ?? undefined, true)
				.then((children) => {
					if (!isCurrent()) return
					const created = children.find((item) => item.id === file.file_id)
					if (created) open(attachment(created))
				})
				.catch(() => {
					if (isCurrent()) magicToast.error(t("userSpace.refreshAfterChangeFailed"))
				})
		},
	})
	const virtualFile = useVirtualFile({
		attachments: [],
		allowDotStart: true,
		isCurrent,
		onFileCreate: operations.createFileAndUpload,
	})
	const virtualFolder = useVirtualFolder({
		attachments: [],
		allowDotStart: true,
		isCurrent,
		onFolderCreate: operations.createFolderAndUpload,
	})
	const rename = useRename({
		fileScope: "user",
		allowDotStart: true,
		isCurrent,
		resolveSiblings: async (file) => {
			const files = await userFilesStore.loadDirectory(file.parent_id ?? undefined, true)
			assertCurrent()
			return files.map(attachment)
		},
		beforeRename: async (file, name) => {
			if (!file.file_id || !isSelectable(file)) return false
			if (!file.is_directory && name.split(".").pop() !== file.file_name?.split(".").pop())
				return userFilesStore.confirmFileChanges([file.file_id])
			return true
		},
		onRenameSuccess: (id) =>
			refresh([options.items.find((file) => file.file_id === id)?.parent_id]),
	})
	const root = userFilesStore.rootId ? userFilesStore.files.get(userFilesStore.rootId) : undefined
	const move = useMoveFile({
		attachments: options.items,
		setSelectedItems: setSelection,
		isCurrent,
		directorySource:
			root && identity
				? {
						root: {
							...attachment(root),
							file_name: t("userSpace.title"),
							name: t("userSpace.title"),
						},
						identityKey: identity,
						loadChildren: async (id, signal) => {
							const { files } = await MagicFSApi.listFiles(
								{ scope: "user", parent_id: id },
								{ signal },
							)
							assertCurrent()
							userFilesStore.cacheDirectory(id, files, identity)
							return files.map(attachment)
						},
					}
				: undefined,
		onDirectoryMoveComplete: (files, targetId) =>
			refresh([targetId, ...files.map((file) => file.parent_id)]),
	})
	const batch = useBatchDownload({
		projectId: "0",
		fileScope: "user",
		getItemId: getAttachmentKey,
		selectedItems: selection,
		setSelectedItems: setSelection,
		filteredFiles: options.items,
		isCurrent,
		resolveDeleteItems: async (selected) => {
			const trees = await userFilesStore.loadSubtrees(selected)
			if (viewKey !== currentView.current)
				throw new DOMException("Directory changed", "AbortError")
			return trees
		},
		beforeDelete: async (ids) =>
			(await userFilesStore.confirmFileChanges(ids)) && viewKey === currentView.current,
		onFilesDeleted: userFilesStore.removeFiles,
		onUpdateAttachments: () => refresh(options.items.map((file) => file.parent_id)),
		allowShare: false,
		allowCopy: false,
	})
	const uploadParent = useRef<{ resolve: () => Promise<MagicFSFile>; identity: string } | null>(
		null,
	)
	const resolveUploadTarget = useMemoizedFn(async (): Promise<UploadTarget> => {
		const source = uploadParent.current
		if (!source || source.identity !== getFileReferenceIdentityKey())
			throw new DOMException("Upload cancelled", "AbortError")
		const uploadIdentity = source.identity
		const parent = await source.resolve()
		const isUploadCurrent = () => uploadIdentity === getFileReferenceIdentityKey()
		if (!isUploadCurrent()) throw new DOMException("Identity changed", "AbortError")
		const children = await userFilesStore.loadDirectory(parent.id, true)
		if (!isUploadCurrent()) throw new DOMException("Identity changed", "AbortError")
		return {
			parentId: parent.id,
			attachments: [{ ...attachment(parent), children: children.map(attachment) }],
			isCurrent: isUploadCurrent,
			onTaskCreated: userFilesStore.trackUpload,
			onTaskFinished: userFilesStore.finishUpload,
			onUpdateAttachments: () => {
				if (isUploadCurrent())
					void userFilesStore.loadDirectory(parent.id, true).catch(() => {
						if (isUploadCurrent()) magicToast.error(t("userSpace.loadFailed"))
					})
			},
		}
	})
	const upload = useUploadWithModal({
		projectId: "0",
		fileScope: "user",
		title: t("userSpace.title"),
		resolveUploadTarget,
	})
	const resolveParent = (id?: string) =>
		id
			? async () => {
					assertCurrent()
					const file = userFilesStore.files.get(id)
					if (!file?.is_directory) throw new Error("Directory is unavailable")
					return file
				}
			: options.resolveParent
	const create = (type: PresetFileType | true, id?: string) => {
		if (virtualFile.editingVirtualId || virtualFolder.editingVirtualId) return
		createParent.current = { resolve: resolveParent(id) }
		if (type === true) virtualFolder.createVirtualFolder()
		else virtualFile.createVirtualFile(type)
	}
	const uploadFiles = (id?: string) => {
		if (!identity) return
		uploadParent.current = { resolve: resolveParent(id), identity }
		upload.handleCustomUploadFile()
	}
	const remove = (files: AttachmentItem[]) =>
		void batch.deleteWithConfirm(files.filter(isSelectable))
	const startMove = async (files: AttachmentItem[]) => {
		const ids = files
			.filter(isSelectable)
			.flatMap((file) => (file.file_id ? [file.file_id] : []))
		if (!ids.length) return
		try {
			await userFilesStore.getRoot()
			assertCurrent()
			move.openBatchMoveByFileIds(ids)
		} catch {
			if (isCurrent()) magicToast.error(t("userSpace.loadFailed"))
		}
	}
	const busy =
		virtualFile.isCreating ||
		virtualFolder.isCreating ||
		rename.renamePending ||
		move.isMoving ||
		batch.batchLoading
	const menu = useContextMenu({
		handleOpenFile: open,
		handleOpenDirectory: (file) => options.onNavigate(file.file_id),
		handleDeleteItem: (file) => remove([file]),
		handleDeleteWithConfirm: (file) => remove([file]),
		handleStartRename: (file) => {
			if (isSelectable(file)) rename.handleStartRename(file)
		},
		handleAddToCurrentChat: (file) => void addToChat(file),
		handleMoveFile: (file) => void startMove([file]),
		handleShowInfo: info.handleShowInfo,
		handleUploadFile: (file) => uploadFiles(file?.file_id),
		createVirtualFile: (type, id) => create(type, id),
		createVirtualFolder: (id) => create(true, id),
		handleDownloadOriginal: operations.handleDownloadOriginal,
		handleDownloadPdf: operations.handleDownloadPdf,
		handleDownloadPpt: operations.handleDownloadPpt,
		handleDownloadPptx: operations.handleDownloadPptx,
		shouldUseSingleDownloadEntry: true,
		isMoving: busy,
		filterMenuItems: (items, file) =>
			items.filter((item) => {
				if (!item) return false
				if (file?.is_directory && item.key === "downloadFolder") return false
				return (
					!file ||
					isSelectable(file) ||
					!["rename", "moveFile", "delete"].includes(String(item.key))
				)
			}),
	})
	const resetActions = useMemoizedFn(() => {
		info.handleCloseInfoPanel()
		virtualFile.resetVirtualFile()
		virtualFolder.resetVirtualFolder()
		rename.resetRename()
		move.hideMoveSelector()
		move.clearFailures()
		setSelection(new Set())
	})
	useEffect(() => {
		resetActions()
	}, [identity, resetActions])
	useEffect(() => {
		setSelection(new Set())
	}, [viewKey])
	const cancelUpload = useMemoizedFn(upload.cancelDirectUpload)
	useEffect(() => {
		cancelUpload()
	}, [identity, cancelUpload])
	return {
		open,
		create,
		rename,
		virtualFile,
		virtualFolder,
		move,
		upload,
		uploadFiles,
		remove,
		startMove,
		busy,
		selection,
		setSelection,
		isSelectable,
		getMenuItems: menu.getMenuItems,
		createMenuItems: createFileMenuItems({
			t,
			onAddFile: (type) => create(type),
			onAddFolder: () => create(true),
		}),
		fileInfoPanel: info.fileInfoPanel,
		downloadSelected: operations.downloadSelectedFiles,
	}
}
