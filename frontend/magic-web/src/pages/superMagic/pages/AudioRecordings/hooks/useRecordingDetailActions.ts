import { useCallback, useMemo, useState } from "react"
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
import { downloadRecordingAttachmentFile } from "../utils/download-recording-attachment"
import {
	collectExportableFileIds,
	downloadRecordingFilesBatch,
	resolveExportableFileRefs,
} from "../utils/download-recording-batch"
import { getAttachmentFileName } from "../utils/recording-detail-files"
import { canGenerateSummaryFromDetail } from "../utils/summary-action-utils"

interface UseRecordingDetailActionsInput {
	projectId: string
	projectItem: AudioProjectListItem | null
	fileMap: RecordingDetailFileMap | null
	recordingName: string
	onProjectItemChange: (item: AudioProjectListItem) => void
	onRefresh: () => Promise<void> | void
}

/** Facade for owner recording detail mutations shared by PC workbench header actions. */
export function useRecordingDetailActions(input: UseRecordingDetailActionsInput) {
	const { projectId, projectItem, fileMap, recordingName, onProjectItemChange, onRefresh } = input
	const { t } = useTranslation("audioRecordings")
	const navigate = useNavigate()
	const [renaming, setRenaming] = useState(false)
	const [deleting, setDeleting] = useState(false)
	const [moving, setMoving] = useState(false)
	const [summarySubmitting, setSummarySubmitting] = useState(false)
	const [downloading, setDownloading] = useState(false)

	const exportAvailability = useMemo(
		() => ({
			hasAudio: Boolean(fileMap?.audio?.file_id),
			hasTranscript: Boolean(fileMap?.transcript?.file_id),
			hasNotes: Boolean(fileMap?.notes?.file_id),
			hasSummaryFiles: Boolean(fileMap?.summaryFiles?.length),
			hasAnyExportable: collectExportableFileIds(fileMap).length > 0,
		}),
		[fileMap],
	)

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

	const runDownload = useCallback(
		async (task: () => Promise<boolean>) => {
			if (downloading) return false
			setDownloading(true)
			try {
				const ok = await task()
				if (!ok) toast.error(t("detail.loadFailed"))
				return ok
			} finally {
				setDownloading(false)
			}
		},
		[downloading, t],
	)

	const downloadAudio = useCallback(async () => {
		const fileId = fileMap?.audio?.file_id
		if (!fileId) return false
		return runDownload(() =>
			downloadRecordingAudioFile({
				fileId,
				audioFile: fileMap?.audio,
				fallbackName: getAttachmentFileName(fileMap?.audio),
			}),
		)
	}, [fileMap?.audio, runDownload])

	const downloadTranscript = useCallback(async () => {
		const fileId = fileMap?.transcript?.file_id
		if (!fileId) return false
		const fileName =
			getAttachmentFileName(fileMap?.transcript) || `${recordingName}_transcript.md`
		return runDownload(() => downloadRecordingAttachmentFile({ fileId, fileName }))
	}, [fileMap?.transcript, recordingName, runDownload])

	const downloadNotes = useCallback(async () => {
		const fileId = fileMap?.notes?.file_id
		if (!fileId) return false
		const fileName = getAttachmentFileName(fileMap?.notes) || `${recordingName}_notes.md`
		return runDownload(() => downloadRecordingAttachmentFile({ fileId, fileName }))
	}, [fileMap?.notes, recordingName, runDownload])

	const downloadSummaryType = useCallback(
		async (type: string) => {
			const fileRef = fileMap?.summaryFiles.find((item) => item.type === type)
			const fileId = fileRef?.file?.file_id
			if (!fileId) return false
			const fileName = getAttachmentFileName(fileRef.file) || `${recordingName}_${type}.md`
			return runDownload(() => downloadRecordingAttachmentFile({ fileId, fileName }))
		},
		[fileMap?.summaryFiles, recordingName, runDownload],
	)

	const downloadAll = useCallback(async () => {
		const fileIds = collectExportableFileIds(fileMap)
		if (fileIds.length === 0) return false

		const fileNameById = Object.fromEntries(
			resolveExportableFileRefs(fileMap, recordingName).map((ref) => [
				ref.fileId,
				ref.fileName,
			]),
		)

		return runDownload(() =>
			downloadRecordingFilesBatch({
				fileIds,
				projectId,
				fileNameById,
			}),
		)
	}, [fileMap, projectId, recordingName, runDownload])

	const canGenerateSummary = projectItem
		? canGenerateSummaryFromDetail({
				phase: projectItem.current_phase,
				status: projectItem.phase_status,
				isSubmitting: summarySubmitting,
				extra: {
					task_key: projectItem.task_key,
					topic_id: projectItem.topic_id,
					audio_file_id: projectItem.audio_file_id,
					audio_source: projectItem.audio_source,
				},
			})
		: false

	return {
		renaming,
		deleting,
		moving,
		summarySubmitting,
		downloading,
		exportAvailability,
		canGenerateSummary,
		renameProject,
		deleteProject,
		moveToGroup,
		submitSummary,
		downloadAudio,
		downloadTranscript,
		downloadNotes,
		downloadSummaryType,
		downloadAll,
	}
}
