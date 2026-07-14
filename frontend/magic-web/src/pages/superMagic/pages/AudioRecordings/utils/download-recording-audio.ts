import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import { getAttachmentFileName } from "./recording-detail-files"
import { downloadRecordingAttachmentFile } from "./download-recording-attachment"

interface DownloadRecordingAudioParams {
	fileId?: string
	audioFile?: AttachmentItem
	fallbackName?: string
}

/**
 * Downloads the original recording asset by resolving one temporary OSS link and
 * forwarding it to the shared browser download helper.
 */
export async function downloadRecordingAudioFile({
	fileId,
	audioFile,
	fallbackName,
}: DownloadRecordingAudioParams): Promise<boolean> {
	if (!fileId) return false

	const preferredName = getAttachmentFileName(audioFile) || fallbackName
	return downloadRecordingAttachmentFile({
		fileId,
		fileName: preferredName || undefined,
	})
}
