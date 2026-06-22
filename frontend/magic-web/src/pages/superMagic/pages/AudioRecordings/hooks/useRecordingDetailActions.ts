import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import useNavigate from "@/routes/hooks/useNavigate"
import { RouteName } from "@/routes/constants"
import type { AudioProjectListItem } from "@/types/audioProject"
import type { RecordingDetailFileMap } from "../types/recording-detail"
import {
	buildOptimisticSummarizingProject,
	deleteAudioRecordingProjects,
	moveAudioRecordingProjects,
	renameAudioRecordingProject,
	submitAudioRecordingSummary,
} from "../utils/audio-recording-actions"
import { downloadRecordingAudioFile } from "../utils/download-recording-audio"
import { getAttachmentFileName } from "../utils/recording-detail-files"
import { canSubmitSummary } from "../utils/summary-action-utils"

interface UseRecordingDetailActionsInput {
	projectId: string
	projectItem: AudioProjectListItem | null
	fileMap: RecordingDetailFileMap | null
	onProjectItemChange: (item: AudioProjectListItem) => void
	onRefresh: () => Promise<void> | void
}

/** Facade for owner recording detail mutations shared by PC workbench header actions. */
export function useRecordingDetailActions(input: UseRecordingDetailActionsInput) {
	const { projectId, projectItem, fileMap, onProjectItemChange, onRefresh } = input
	const { t } = useTranslation("audioRecordings")
	const navigate = useNavigate()
	const [renaming, setRenaming] = useState(false)
	const [deleting, setDeleting] = useState(false)
	const [moving, setMoving] = useState(false)
	const [summarySubmitting, setSummarySubmitting] = useState(false)
	const [downloading, setDownloading] = useState(false)

	const renameProject = useCallback(
		async (name: string) => {
			if (!projectId || !name.trim()) return false
			setRenaming(true)
			try {
				await renameAudioRecordingProject(projectId, name.trim())
				if (projectItem) {
					onProjectItemChange({ ...projectItem, project_name: name.trim() })
				}
				toast.success(t("actions.renameSuccess"))
				return true
			} catch {
				toast.error(t("actions.renameFailed"))
				return false
			} finally {
				setRenaming(false)
			}
		},
		[onProjectItemChange, projectId, projectItem, t],
	)

	const deleteProject = useCallback(async () => {
		if (!projectId) return false
		setDeleting(true)
		try {
			await deleteAudioRecordingProjects([projectId])
			toast.success(t("actions.deleteSuccess"))
			navigate({ name: RouteName.AudioRecordings })
			return true
		} catch {
			toast.error(t("actions.deleteFailed"))
			return false
		} finally {
			setDeleting(false)
		}
	}, [navigate, projectId, t])

	const moveToGroup = useCallback(
		async (targetWorkspaceId: string) => {
			if (!projectId) return false
			setMoving(true)
			try {
				await moveAudioRecordingProjects([projectId], targetWorkspaceId)
				toast.success(t("card.moveToGroup"))
				await onRefresh()
				return true
			} catch {
				toast.error(t("detail.loadFailed"))
				return false
			} finally {
				setMoving(false)
			}
		},
		[onRefresh, projectId, t],
	)

	const submitSummary = useCallback(async () => {
		if (!projectItem) return false
		setSummarySubmitting(true)
		try {
			const result = await submitAudioRecordingSummary(projectItem)
			if (!result.ok) {
				if (result.reason === "missingModel") {
					toast.error(t("summary.missingModel"))
				} else {
					toast.error(t("detail.loadFailed"))
				}
				return false
			}
			onProjectItemChange(buildOptimisticSummarizingProject(projectItem))
			toast.success(t("card.generateSummary"))
			return true
		} finally {
			setSummarySubmitting(false)
		}
	}, [onProjectItemChange, projectItem, t])

	const downloadAudio = useCallback(async () => {
		const fileId = fileMap?.audio?.file_id
		if (!fileId || downloading) return false
		setDownloading(true)
		try {
			const ok = await downloadRecordingAudioFile({
				fileId,
				audioFile: fileMap?.audio,
				fallbackName: getAttachmentFileName(fileMap?.audio),
			})
			if (!ok) {
				toast.error(t("detail.audioNotFound"))
				return false
			}
			return true
		} finally {
			setDownloading(false)
		}
	}, [downloading, fileMap?.audio, t])

	const exportUnavailable = useCallback(() => {
		toast.message(t("detail.exportUnavailable"))
	}, [t])

	const canGenerateSummary = projectItem
		? canSubmitSummary({
				task_key: projectItem.task_key,
				topic_id: projectItem.topic_id,
				audio_file_id: projectItem.audio_file_id,
				audio_source: projectItem.audio_source,
			})
		: false

	return {
		renaming,
		deleting,
		moving,
		summarySubmitting,
		downloading,
		canGenerateSummary,
		renameProject,
		deleteProject,
		moveToGroup,
		submitSummary,
		downloadAudio,
		exportUnavailable,
	}
}
