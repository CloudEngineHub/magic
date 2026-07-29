import { useCallback, useMemo, useRef } from "react"
import { flattenAttachmentsList } from "../utils/utils"
import { buildDesignAttachmentIndex } from "../utils/designAttachmentIndex"
import type { DesignAttachmentIndex } from "../utils/designAttachmentIndex"
import type { FileItem } from "@/pages/superMagic/components/Detail/components/FilesViewer/types"
import { requestProjectAttachmentsFullRefresh } from "@/pages/superMagic/services/attachmentsTopicSync"

interface UseAttachmentsOptions {
	/** 附件列表 */
	attachments?: FileItem[]
	/** 已扁平化的附件列表 */
	attachmentList?: FileItem[]
	/** 当前项目 ID，用于请求附件树刷新 */
	projectId?: string
}

interface UseAttachmentsReturn {
	/** 已扁平化的附件列表 */
	flatAttachments: FileItem[]
	/** 附件快照是否已由入口提供；观测过真实快照后，空数组也可能是一个有效快照 */
	attachmentsReady: boolean
	/** 附件索引（路径 / id / 文件名维度快速查找） */
	attachmentIndex: DesignAttachmentIndex
	/** 触发文件列表更新，返回新的文件列表 */
	updateAttachments: () => void
}

/**
 * 文件列表更新处理 Hook
 */
export function useAttachments(options: UseAttachmentsOptions): UseAttachmentsReturn {
	const { attachments, attachmentList, projectId } = options
	const hasObservedAttachmentSnapshotRef = useRef(false)

	// 扁平化附件列表
	const flatAttachments = useMemo(() => {
		// 如果 attachmentList 存在，直接使用（已经是扁平化的）
		if (attachmentList && attachmentList.length > 0) {
			return attachmentList
		}
		// 否则从 attachments 扁平化
		if (!attachments) return []
		return flattenAttachmentsList(attachments)
	}, [attachments, attachmentList])

	if (flatAttachments.length > 0) {
		hasObservedAttachmentSnapshotRef.current = true
	}

	const attachmentsReady =
		hasObservedAttachmentSnapshotRef.current &&
		(Array.isArray(attachmentList) || Array.isArray(attachments))

	const attachmentIndex = useMemo(
		() => buildDesignAttachmentIndex(flatAttachments),
		[flatAttachments],
	)

	/**
	 * 触发文件列表更新
	 */
	const updateAttachments = useCallback(() => {
		if (!projectId) return
		requestProjectAttachmentsFullRefresh({
			projectId,
			reason: "design-attachments-refresh",
		})
	}, [projectId])

	return {
		flatAttachments,
		attachmentsReady,
		attachmentIndex,
		updateAttachments,
	}
}
