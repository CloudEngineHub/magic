import { getTemporaryDownloadUrl } from "@/pages/superMagic/utils/api"
import { downloadFileWithAnchor } from "@/pages/superMagic/utils/handleFIle"

interface DownloadRecordingAttachmentParams {
	fileId: string
	fileName?: string
}

/**
 * Resolves one temporary OSS link and triggers a browser download for a recording attachment.
 */
export async function downloadRecordingAttachmentFile({
	fileId,
	fileName,
}: DownloadRecordingAttachmentParams): Promise<boolean> {
	if (!fileId) return false

	try {
		const [urlItem] = await getTemporaryDownloadUrl({ file_ids: [fileId] })
		if (!urlItem?.url) return false

		await downloadFileWithAnchor(urlItem.url, fileName || undefined)
		return true
	} catch (error) {
		console.error("Failed to download recording attachment:", error)
		return false
	}
}
