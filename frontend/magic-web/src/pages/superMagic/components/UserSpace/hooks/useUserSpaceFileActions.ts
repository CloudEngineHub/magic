import { useEffect, useRef, useState } from "react"
import { useMemoizedFn } from "ahooks"
import { useTranslation } from "react-i18next"
import { MagicFSApi, type MagicFSFile } from "@/apis"
import magicToast from "@/components/base/MagicToaster/utils"
import MagicModal from "@/components/base/MagicModal"
import userFilesStore from "@/stores/userFiles"
import { validateFilename } from "@/utils/filename-validator"
import type { AttachmentItem } from "../../TopicFilesButton/hooks/types"
import { addFileToCurrentChat } from "../../../utils/topics"
import { getFileReferenceIdentityKey } from "../../../services/userFileReferenceResolver"
import { isFixedUserMemoryEntry } from "../../LongTremMemory/components/memoryTreeNodeUtils"
import {
	toUserAttachment,
	userSpaceFileService,
	USER_FILE_DELETE_BATCH_SIZE,
} from "../services/userSpaceFileService"

export type UserFileNameAction =
	| { type: "create"; directory: boolean; parent: () => Promise<MagicFSFile> }
	| { type: "rename"; file: AttachmentItem }
export interface UserFileOperationFailure {
	file: AttachmentItem
	message: string
}

export function useUserSpaceFileActions(options: {
	onOpen?: (file: AttachmentItem) => void
	topicId?: string | null
}) {
	const { t } = useTranslation("super")
	const identity = getFileReferenceIdentityKey()
	const [info, setInfo] = useState<AttachmentItem | null>(null)
	const [nameAction, setNameAction] = useState<UserFileNameAction | null>(null)
	const [name, setName] = useState("")
	const [nameError, setNameError] = useState("")
	const [busy, setBusy] = useState(false)
	const busyRef = useRef(false)
	const [moveFiles, setMoveFiles] = useState<AttachmentItem[]>([])
	const [moveRoot, setMoveRoot] = useState<MagicFSFile | null>(null)
	const [failures, setFailures] = useState<UserFileOperationFailure[]>([])
	const [successCount, setSuccessCount] = useState(0)
	const [selection, setSelection] = useState<Set<string>>(new Set())
	const isCurrent = () => identity === getFileReferenceIdentityKey()
	const assertCurrent = () => {
		if (!isCurrent()) throw new DOMException("Identity changed", "AbortError")
	}
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
	useEffect(() => {
		setInfo(null)
		setNameAction(null)
		setMoveFiles([])
		setMoveRoot(null)
		setSelection(new Set())
		setFailures([])
		setBusy(false)
		busyRef.current = false
	}, [identity])
	const begin = () => {
		if (busyRef.current) return false
		busyRef.current = true
		setBusy(true)
		return true
	}
	const end = () => {
		if (isCurrent()) {
			busyRef.current = false
			setBusy(false)
		}
	}
	const refresh = async (parents: Array<string | null | undefined>) => {
		assertCurrent()
		await Promise.all(
			[...new Set(parents.filter((id): id is string => Boolean(id)))].map((id) =>
				userFilesStore.loadDirectory(id, true),
			),
		)
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
	const create = (directory: boolean, parent: () => Promise<MagicFSFile>) => {
		setNameAction({ type: "create", directory, parent })
		setName(directory ? t("userSpace.defaultFolder") : t("userSpace.defaultFile"))
		setNameError("")
	}
	const rename = (file: AttachmentItem) => {
		if (!isSelectable(file)) return
		setNameAction({ type: "rename", file })
		setName(file.file_name ?? file.name ?? "")
		setNameError("")
	}
	const submitName = async () => {
		if (!nameAction || !begin()) return
		const action = nameAction
		let committed = false
		try {
			assertCurrent()
			const directory =
				action.type === "create" ? action.directory : Boolean(action.file.is_directory)
			const result = validateFilename(name, directory, { t, allowDotStart: true })
			if (!result.isValid) {
				setNameError(result.errorMessage ?? t("userSpace.invalidName"))
				return
			}
			if (action.type === "create") {
				const parent = await action.parent()
				assertCurrent()
				const siblings = await userFilesStore.loadDirectory(parent.id, true)
				assertCurrent()
				if (siblings.some((file) => file.name === name)) {
					setNameError(t("userSpace.nameExists"))
					return
				}
				const file = await userSpaceFileService.createNode({
					name,
					parentId: parent.id,
					isDirectory: directory,
				})
				committed = true
				assertCurrent()
				userFilesStore.notifyMutation()
				await refresh([parent.id])
				if (!directory) open(attachment(file))
			} else {
				if (!action.file.file_id || !isSelectable(action.file)) return
				if (name === action.file.file_name) {
					setNameAction(null)
					return
				}
				const siblings = await userFilesStore.loadDirectory(
					action.file.parent_id ?? undefined,
					true,
				)
				assertCurrent()
				if (
					siblings.some((file) => file.name === name && file.id !== action.file.file_id)
				) {
					setNameError(t("userSpace.nameExists"))
					return
				}
				if (
					!action.file.is_directory &&
					name.split(".").pop() !== (action.file.file_name ?? "").split(".").pop() &&
					!(await userFilesStore.confirmFileChanges([action.file.file_id]))
				)
					return
				assertCurrent()
				await userSpaceFileService.renameNode(action.file.file_id, name)
				committed = true
				assertCurrent()
				userFilesStore.notifyMutation()
				await refresh([action.file.parent_id])
			}
			assertCurrent()
			setNameAction(null)
			magicToast.success(t("userSpace.saved"))
		} catch {
			if (isCurrent()) {
				if (committed) setNameAction(null)
				setNameError(t("userSpace.operationFailed"))
				magicToast.error(
					t(
						committed
							? "userSpace.refreshAfterChangeFailed"
							: "userSpace.operationFailed",
					),
				)
			}
		} finally {
			end()
		}
	}
	const startMove = async (files: AttachmentItem[]) => {
		const movable = files.filter(isSelectable)
		if (!movable.length) return
		try {
			const root = await userFilesStore.getRoot()
			assertCurrent()
			setMoveRoot(root)
			setMoveFiles(movable)
			setFailures([])
		} catch {
			if (isCurrent()) magicToast.error(t("userSpace.loadFailed"))
		}
	}
	const submitMove = async (targetId: string) => {
		if (!begin()) return
		const succeeded: string[] = []
		const failed: UserFileOperationFailure[] = []
		const parents = new Set<string>([targetId])
		try {
			const targetPath = userFilesStore.getPath(targetId)
			for (const file of moveFiles) {
				assertCurrent()
				if (!file.file_id || !isSelectable(file)) continue
				if (file.parent_id === targetId) {
					succeeded.push(file.file_id)
					continue
				}
				if (
					file.file_id === targetId ||
					targetPath.some((node) => node.id === file.file_id)
				) {
					failed.push({ file, message: t("userSpace.invalidMoveTarget") })
					continue
				}
				if (file.parent_id) parents.add(file.parent_id)
				try {
					const children = await userFilesStore.loadDirectory(targetId, true)
					assertCurrent()
					if (children.some((child) => child.name === (file.file_name ?? file.name))) {
						failed.push({ file, message: t("userSpace.nameExists") })
						continue
					}
					await userSpaceFileService.moveNode(file.file_id, targetId)
					succeeded.push(file.file_id)
					if (file.parent_id) parents.add(file.parent_id)
				} catch {
					failed.push({ file, message: t("userSpace.operationFailed") })
				}
			}
			assertCurrent()
			userFilesStore.notifyMutation()
			setMoveFiles([])
			setMoveRoot(null)
			setSuccessCount(succeeded.length)
			setFailures(failed)
			setSelection(
				new Set(failed.flatMap(({ file }) => (file.file_id ? [file.file_id] : []))),
			)
			await refresh([...parents])
			if (!failed.length)
				magicToast.success(t("userSpace.moveSuccess", { count: succeeded.length }))
		} catch {
			if (isCurrent()) magicToast.error(t("userSpace.refreshAfterChangeFailed"))
		} finally {
			end()
		}
	}
	const remove = (files: AttachmentItem[]) => {
		const targets = files.filter(isSelectable)
		if (!targets.length) return
		MagicModal.confirm({
			title: t("userSpace.deleteConfirm"),
			content: t("userSpace.deleteDescription", { count: targets.length }),
			okText: t("userSpace.delete"),
			cancelText: t("common.cancel"),
			onOk: async () => {
				if (!begin()) return
				let committed = false
				try {
					assertCurrent()
					const ids = targets.flatMap((file) => (file.file_id ? [file.file_id] : []))
					if (!(await userFilesStore.confirmFileChanges(ids))) return
					assertCurrent()
					const confirmed = new Set<string>()
					for (
						let offset = 0;
						offset < ids.length;
						offset += USER_FILE_DELETE_BATCH_SIZE
					) {
						assertCurrent()
						try {
							const deleted = await userSpaceFileService.deleteNodes(
								ids.slice(offset, offset + USER_FILE_DELETE_BATCH_SIZE),
							)
							assertCurrent()
							deleted.forEach((id) => confirmed.add(id))
							userFilesStore.removeFiles(deleted)
						} catch {
							assertCurrent()
						}
					}
					committed = confirmed.size > 0
					userFilesStore.notifyMutation()
					const failed = targets
						.filter((file) => !confirmed.has(file.file_id ?? ""))
						.map((file) => ({ file, message: t("userSpace.operationFailed") }))
					setFailures(failed)
					setSuccessCount(confirmed.size)
					setSelection(
						new Set(failed.flatMap(({ file }) => (file.file_id ? [file.file_id] : []))),
					)
					await refresh(targets.map((file) => file.parent_id))
					if (!failed.length) magicToast.success(t("userSpace.deleted"))
				} catch {
					if (isCurrent())
						magicToast.error(
							t(
								committed
									? "userSpace.refreshAfterChangeFailed"
									: "userSpace.operationFailed",
							),
						)
				} finally {
					end()
				}
			},
		})
	}
	const download = async (file: AttachmentItem) => {
		if (!file.file_id || file.is_directory) return
		try {
			await userSpaceFileService.downloadFile(file.file_id, file.file_name ?? file.name ?? "")
		} catch {
			if (isCurrent()) magicToast.error(t("topicFiles.downloadFailed"))
		}
	}
	const downloadSelected = (files: AttachmentItem[]) => {
		void (async () => {
			for (const file of files) {
				assertCurrent()
				await download(file)
			}
		})().catch(() => undefined)
	}
	return {
		info,
		setInfo,
		nameAction,
		setNameAction,
		name,
		setName,
		nameError,
		busy,
		submitName,
		create,
		rename,
		open,
		addToChat,
		startMove,
		submitMove,
		moveFiles,
		moveRoot,
		closeMove: () => {
			if (!busy) {
				setMoveFiles([])
				setMoveRoot(null)
			}
		},
		failures,
		successCount,
		clearFailures: () => setFailures([]),
		remove,
		download,
		downloadSelected,
		isSelectable,
		selection,
		setSelection,
		attachment,
		loadTargetDirectory: async (id: string, signal: AbortSignal) => {
			const { files } = await MagicFSApi.listFiles(
				{ scope: "user", parent_id: id },
				{ signal },
			)
			assertCurrent()
			// 同步目标父链到共享缓存，提交移动时可校验自身和子孙关系。
			userFilesStore.cacheDirectory(id, files, identity)
			return files.filter((file) => file.is_directory).map(attachment)
		},
	}
}
