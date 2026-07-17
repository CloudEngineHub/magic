import i18next from "i18next"
import { toast } from "sonner"
import { SuperMagicApi } from "@/apis"
import { downloadFileWithAnchor } from "@/pages/superMagic/utils/handleFIle"
import type { RecordingDetailFileMap } from "../types/recording-detail"
import { getAttachmentFileName } from "./recording-detail-files"
import { downloadRecordingAttachmentFile } from "./download-recording-attachment"
import type { DownloadProgressController } from "@/pages/superMagic/hooks/useDownloadProgress"
export { collectExportableFileIds } from "./build-recording-share-selection"

const BATCH_POLL_INTERVAL_MS = 2000
const BATCH_POLL_MAX_ATTEMPTS = 60

interface ExportableFileRef {
	fileId: string
	fileName: string
}

interface DownloadRecordingFilesBatchParams {
	fileIds: string[]
	projectId?: string
	fileNameById?: Record<string, string>
	startDownload?: DownloadProgressController["startDownload"]
	onCancel?: () => void
}

/**
 * Resolves exportable refs with stable filenames for single-file downloads.
 */
export function resolveExportableFileRefs(
	fileMap: RecordingDetailFileMap | null,
	recordingName: string,
): ExportableFileRef[] {
	if (!fileMap) return []

	const refs: ExportableFileRef[] = []

	function pushRef(fileId: string | undefined, fallbackName: string) {
		if (!fileId) return
		refs.push({ fileId, fileName: fallbackName })
	}

	if (fileMap.audio?.file_id) {
		pushRef(
			fileMap.audio.file_id,
			getAttachmentFileName(fileMap.audio) || `${recordingName}_audio`,
		)
	}
	if (fileMap.transcript?.file_id) {
		pushRef(
			fileMap.transcript.file_id,
			getAttachmentFileName(fileMap.transcript) || `${recordingName}_transcript.md`,
		)
	}
	if (fileMap.notes?.file_id) {
		pushRef(
			fileMap.notes.file_id,
			getAttachmentFileName(fileMap.notes) || `${recordingName}_notes.md`,
		)
	}
	fileMap.summaryFiles.forEach((ref) => {
		if (!ref.file?.file_id) return
		refs.push({
			fileId: ref.file.file_id,
			fileName: getAttachmentFileName(ref.file) || `${recordingName}_${ref.type}.md`,
		})
	})

	return refs
}

/**
 * Downloads one or many recording files; multiple ids are packed via the batch-download API.
 */
export async function downloadRecordingFilesBatch({
	fileIds,
	projectId,
	fileNameById = {},
	startDownload,
	onCancel,
}: DownloadRecordingFilesBatchParams): Promise<boolean> {
	if (fileIds.length === 0) return false

	if (fileIds.length === 1) {
		const fileId = fileIds[0]
		return downloadRecordingAttachmentFile({
			fileId,
			fileName: fileNameById[fileId],
		})
	}

	if (startDownload) {
		return startDownload({
			fileIds,
			projectId,
			label: i18next.t("detail.packing", { ns: "audioRecordings" }),
			onSuccess: () => {
				toast.success(i18next.t("detail.packSuccess", { ns: "audioRecordings" }))
			},
			onError: (error) => {
				console.error("Failed to batch download recording files:", error)
				toast.error(i18next.t("detail.loadFailed", { ns: "audioRecordings" }))
			},
			onCancel,
		})
	}

	const toastId = toast.loading(i18next.t("detail.packing", { ns: "audioRecordings" }))

	try {
		const data = await SuperMagicApi.createBatchDownload({
			file_ids: fileIds,
			project_id: projectId,
		})

		if (data.status === "ready" && data.download_url) {
			await downloadFileWithAnchor(data.download_url)
			toast.dismiss(toastId)
			toast.success(i18next.t("detail.packSuccess", { ns: "audioRecordings" }))
			return true
		}

		if (data.status === "processing" && data.batch_key) {
			return await pollBatchDownloadReady(data.batch_key, toastId)
		}

		toast.dismiss(toastId)
		toast.error(i18next.t("detail.loadFailed", { ns: "audioRecordings" }))
		return false
	} catch (error) {
		console.error("Failed to batch download recording files:", error)
		toast.dismiss(toastId)
		toast.error(i18next.t("detail.loadFailed", { ns: "audioRecordings" }))
		return false
	}
}

/** Polls batch-download status until the zip is ready or the request fails. */
function pollBatchDownloadReady(batchKey: string, toastId: string | number): Promise<boolean> {
	return new Promise((resolve) => {
		let attempts = 0

		const timer = setInterval(async () => {
			attempts += 1
			try {
				const checkData = await SuperMagicApi.checkBatchDownloadStatus(batchKey)
				if (checkData.status === "ready" && checkData.download_url) {
					await downloadFileWithAnchor(checkData.download_url)
					toast.dismiss(toastId)
					toast.success(i18next.t("detail.packSuccess", { ns: "audioRecordings" }))
					clearInterval(timer)
					resolve(true)
					return
				}

				// Explicitly stop polling when the backend reports a terminal failure.
				if (checkData.status === "failed") {
					toast.dismiss(toastId)
					toast.error(
						checkData.message ||
							i18next.t("detail.loadFailed", { ns: "audioRecordings" }),
					)
					clearInterval(timer)
					resolve(false)
					return
				}

				// Guard against never-ending processing so detail actions can recover.
				if (attempts >= BATCH_POLL_MAX_ATTEMPTS) {
					toast.dismiss(toastId)
					toast.error(i18next.t("detail.loadFailed", { ns: "audioRecordings" }))
					clearInterval(timer)
					resolve(false)
				}
			} catch (error) {
				console.error("Checking batch download status failed:", error)
				toast.dismiss(toastId)
				toast.error(i18next.t("detail.loadFailed", { ns: "audioRecordings" }))
				clearInterval(timer)
				resolve(false)
			}
		}, BATCH_POLL_INTERVAL_MS)
	})
}
