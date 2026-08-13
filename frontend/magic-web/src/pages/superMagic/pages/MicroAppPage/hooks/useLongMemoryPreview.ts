import { useState } from "react"
import { useMemoizedFn } from "ahooks"

import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import type { PreviewDetail } from "@/pages/superMagicMobile/components/PreviewDetailPopup"
import { getFileType } from "@/pages/superMagic/utils/handleFIle"

interface UseLongMemoryPreviewOptions {
	openPreview: (detail: PreviewDetail) => void
}

export function useLongMemoryPreview({ openPreview }: UseLongMemoryPreviewOptions) {
	const [activeLongMemoryFileId, setActiveLongMemoryFileId] = useState<string | null>(null)

	const handleLongMemoryFileClick = useMemoizedFn((fileItem: AttachmentItem) => {
		if (!fileItem.file_id || fileItem.is_directory) return

		setActiveLongMemoryFileId(String(fileItem.file_id))
		openPreview({
			type: getFileType(fileItem.file_extension || ""),
			currentFileId: String(fileItem.file_id),
			// 保留记忆 scope、项目 ID 和文件 key，确保预览与编辑使用记忆文件空间。
			data: fileItem,
		} as PreviewDetail)
	})

	const resetLongMemoryFile = useMemoizedFn(() => {
		setActiveLongMemoryFileId(null)
	})

	return {
		activeLongMemoryFileId,
		handleLongMemoryFileClick,
		resetLongMemoryFile,
	}
}
