import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useDownloadProgress } from "@/pages/superMagic/hooks/useDownloadProgress"
import magicToast from "@/components/base/MagicToaster/utils"

export const useDownloadAll = ({ projectId }: { projectId?: string }) => {
	const { t } = useTranslation("super")
	const [allLoading, setAllLoading] = useState(false)
	const downloadProgress = useDownloadProgress()

	// Download all files in the topic
	const handleDownloadAll = async () => {
		if (!projectId) return
		setAllLoading(true)
		try {
			await downloadProgress.startDownload({
				fileIds: [],
				projectId,
				allowEmptyFileIds: true,
				label: t("topicFiles.downloading"),
				onError: (error) => {
					console.error("Download all files failed:", error)
					magicToast.error(t("topicFiles.downloadFailed"))
				},
				onCancel: () => {
					magicToast.info(t("topicFiles.downloadAbort"))
				},
			})
		} catch (error) {
			console.error("Download all files failed:", error)
			magicToast.error(t("topicFiles.downloadFailed"))
		} finally {
			setAllLoading(false)
		}
	}

	return {
		handleDownloadAll,
		allLoading,
	}
}
