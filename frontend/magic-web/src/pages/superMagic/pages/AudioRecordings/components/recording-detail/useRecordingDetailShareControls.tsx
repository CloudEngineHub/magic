import { useMemo, useState } from "react"
import { openShareManagementModal } from "@/pages/superMagic/components/ShareManagement/openShareManagementModal"
import type { RecordingDetailFileMap } from "../../types/recording-detail"
import { buildRecordingShareSelection } from "../../utils/build-recording-share-selection"

interface RecordingDetailShareControlsInput {
	projectId: string
	fileMap: RecordingDetailFileMap | null
}

/** Exposes share dialog state and actions for the recording detail owner shell dialogs region. */
export function useRecordingDetailShareControls(input: RecordingDetailShareControlsInput) {
	const { projectId, fileMap } = input
	const [shareModalOpen, setShareModalOpen] = useState(false)

	const shareSelection = useMemo(() => buildRecordingShareSelection(fileMap), [fileMap])

	const attachments = shareSelection.shareableFiles
	const attachmentList = shareSelection.shareableFiles
	const defaultSelectedFileIds = shareSelection.defaultSelectedFileIds
	const hasShareableFiles = defaultSelectedFileIds.length > 0

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
		hasShareableFiles,
		openCreateShare,
		openManageShare,
		closeShareModal,
	}
}
