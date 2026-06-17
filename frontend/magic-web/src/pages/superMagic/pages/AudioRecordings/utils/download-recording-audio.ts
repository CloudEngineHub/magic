import { getTemporaryDownloadUrl } from "@/pages/superMagic/utils/api"
import { downloadFileWithAnchor } from "@/pages/superMagic/utils/handleFIle"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import { getAttachmentFileName } from "@/pages/superMagicMobile/pages/AudioRecordingDetail/utils/recording-detail-files"

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

	const [urlItem] = await getTemporaryDownloadUrl({ file_ids: [fileId] })
	if (!urlItem?.url) return false

	const preferredName = getAttachmentFileName(audioFile) || fallbackName
	await downloadFileWithAnchor(urlItem.url, preferredName || undefined)
	return true
}
