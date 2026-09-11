import { useEffect, useRef, useState } from "react"
import { useMemoizedFn } from "ahooks"
import { useTranslation } from "react-i18next"
import type { MagicFSFile } from "@/apis"
import magicToast from "@/components/base/MagicToaster/utils"
import userFilesStore from "@/stores/userFiles"
import { getFileReferenceIdentityKey } from "../../../services/userFileReferenceResolver"
import { useDuplicateFileHandler } from "../../TopicFilesButton/hooks/useDuplicateFileHandler"
import { toUserAttachment, userSpaceFileService } from "../services/userSpaceFileService"

interface PendingUpload {
	files: File[]
	parent: MagicFSFile
	children: MagicFSFile[]
	identity: string
}

/** 复用文件上传任务、同名确认、进度和取消；凭证与保存目标始终为用户空间。 */
export function useUserSpaceUpload() {
	const { t } = useTranslation("super")
	const [pending, setPending] = useState<PendingUpload | null>(null)
	const startedRef = useRef<PendingUpload | null>(null)
	const inputRef = useRef<HTMLInputElement | null>(null)
	const identity = getFileReferenceIdentityKey()
	const parentPath = pending
		? userFilesStore
				.getPath(pending.parent.id)
				.map((node) => node.name)
				.join("/")
		: ""
	const duplicates = useDuplicateFileHandler({
		attachments: pending
			? [
					{
						...toUserAttachment(pending.parent, parentPath),
						children: pending.children.map((file) =>
							toUserAttachment(
								file,
								[parentPath, file.name].filter(Boolean).join("/"),
							),
						),
					},
				]
			: [],
	})
	const process = useMemoizedFn(async (files: File[]) => {
		if (!pending || pending.identity !== getFileReferenceIdentityKey()) return
		const { parent, identity: uploadIdentity } = pending
		const refresh = () => {
			if (uploadIdentity === getFileReferenceIdentityKey())
				void userFilesStore
					.loadDirectory(parent.id, true)
					.catch(() => magicToast.error(t("userSpace.loadFailed")))
		}
		try {
			const task = await userSpaceFileService.uploadFiles(
				files,
				parent.id,
				t("userSpace.title"),
				uploadIdentity,
				{
					onComplete: (id) => {
						userFilesStore.finishUpload(id)
						refresh()
					},
					onError: (id) => {
						userFilesStore.finishUpload(id)
						refresh()
					},
					onBatchSaveComplete: refresh,
				},
			)
			if (uploadIdentity !== getFileReferenceIdentityKey()) {
				await task.cancel()
				return
			}
			if (task.id) userFilesStore.trackUpload(task.id, task.cancel)
			setPending(null)
		} catch {
			if (uploadIdentity === getFileReferenceIdentityKey())
				magicToast.error(t("userSpace.uploadFailed"))
		}
	})
	useEffect(() => {
		if (!pending || pending === startedRef.current) return
		startedRef.current = pending
		void duplicates
			.handleFilesWithDuplicateCheck(pending.files, pending.parent.id, process)
			.catch(() => magicToast.error(t("userSpace.uploadFailed")))
	}, [pending, duplicates, process, t])
	const cancelDuplicate = useMemoizedFn(() => duplicates.handleCancel())
	useEffect(() => {
		setPending(null)
		cancelDuplicate()
		return () => {
			inputRef.current?.remove()
			inputRef.current = null
		}
	}, [identity, cancelDuplicate])
	const upload = (resolveParent: () => Promise<MagicFSFile>) => {
		const uploadIdentity = getFileReferenceIdentityKey()
		if (!uploadIdentity) return
		inputRef.current?.remove()
		const input = document.createElement("input")
		inputRef.current = input
		input.type = "file"
		input.multiple = true
		input.hidden = true
		input.oncancel = () => input.remove()
		input.onchange = async () => {
			const files = Array.from(input.files ?? [])
			input.remove()
			if (!files.length || uploadIdentity !== getFileReferenceIdentityKey()) return
			try {
				const parent = await resolveParent()
				const children = await userFilesStore.loadDirectory(parent.id, true)
				if (uploadIdentity === getFileReferenceIdentityKey())
					setPending({ files, parent, children, identity: uploadIdentity })
			} catch {
				if (uploadIdentity === getFileReferenceIdentityKey())
					magicToast.error(t("userSpace.uploadFailed"))
			}
		}
		document.body.appendChild(input)
		input.click()
	}
	return {
		upload,
		duplicates,
		cancelPending: () => {
			duplicates.handleCancel()
			setPending(null)
		},
	}
}
