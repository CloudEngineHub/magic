import { useEffect, useMemo, useState } from "react"
import { useMemoizedFn } from "ahooks"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import {
	collectHtmlFiles,
	getAttachmentId,
	getMicroAppPreviewPath,
	isSamePreviewEntryFile,
} from "../utils/microAppFiles"

export function useMicroAppPreviewFiles({
	attachmentList,
	defaultEntryFile,
}: {
	attachmentList: AttachmentItem[]
	defaultEntryFile: AttachmentItem | null
}) {
	const [previewEntryFile, setPreviewEntryFile] = useState(defaultEntryFile)
	const previewHtmlFiles = useMemo(() => collectHtmlFiles(attachmentList), [attachmentList])
	const previewFileOptions = useMemo(
		() =>
			previewHtmlFiles.map((file) => ({
				id: getAttachmentId(file),
				path: getMicroAppPreviewPath(file),
			})),
		[previewHtmlFiles],
	)
	const activePreviewFileId = previewEntryFile ? getAttachmentId(previewEntryFile) : undefined

	const handlePreviewFileChange = useMemoizedFn((fileId: string) => {
		const nextFile = previewHtmlFiles.find((item) => getAttachmentId(item) === fileId)
		if (nextFile) setPreviewEntryFile(nextFile)
	})
	const handlePreviewOpenFile = useMemoizedFn((fileItem?: unknown) => {
		const nextFile = fileItem as AttachmentItem | null | undefined
		if (!nextFile) return

		const nextFileId = getAttachmentId(nextFile)
		const matchedFile = previewHtmlFiles.find((item) => getAttachmentId(item) === nextFileId)
		setPreviewEntryFile(matchedFile || nextFile)
	})

	useEffect(() => {
		// 附件刷新会创建新对象；按文件 ID 保持当前选择，仅在更新时间变化或文件消失时更新。
		const currentPreviewFileId = previewEntryFile ? getAttachmentId(previewEntryFile) : null
		const currentPreviewFile = currentPreviewFileId
			? previewHtmlFiles.find((file) => getAttachmentId(file) === currentPreviewFileId)
			: null
		const nextPreviewEntryFile = currentPreviewFile || defaultEntryFile || null
		if (!isSamePreviewEntryFile(previewEntryFile, nextPreviewEntryFile)) {
			setPreviewEntryFile(nextPreviewEntryFile)
		}
	}, [defaultEntryFile, previewEntryFile, previewHtmlFiles])

	return {
		previewEntryFile,
		setPreviewEntryFile,
		previewFileOptions,
		activePreviewFileId,
		handlePreviewFileChange,
		handlePreviewOpenFile,
	}
}
