import { useMemo, useState } from "react"
import { openShareManagementModal } from "@/pages/superMagic/components/ShareManagement/openShareManagementModal"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"

interface RecordingDetailShareControlsInput {
	projectId: string
	attachments: AttachmentItem[]
	attachmentList: AttachmentItem[]
}

/** Exposes share dialog state and actions for the recording detail owner shell dialogs region. */
export function useRecordingDetailShareControls(input: RecordingDetailShareControlsInput) {
	const { projectId, attachments, attachmentList } = input
	const [shareModalOpen, setShareModalOpen] = useState(false)

	const defaultSelectedFileIds = useMemo(
		() =>
			attachmentList
				.filter((item) => !item.is_hidden && item.file_id)
				.map((item) => item.file_id as string),
		[attachmentList],
	)

	function openCreateShare() {
		setShareModalOpen(true)
	}

	function openManageShare() {
		openShareManagementModal(projectId)
	}

	function closeShareModal() {
		setShareModalOpen(false)
	}

	return {
		shareModalOpen,
		attachments,
		attachmentList,
		defaultSelectedFileIds,
		openCreateShare,
		openManageShare,
		closeShareModal,
	}
}
