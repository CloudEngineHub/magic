import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import magicToast from "@/components/base/MagicToaster/utils"
import type { ExportProgress } from "./useExportZip"

/**
 * Shows MagicToast notifications for export progress/success/error.
 * Used by all platform shells that support ZIP export.
 */
export function useExportProgressToast(progress: ExportProgress, toastId: string) {
	const { t } = useTranslation("super")

	useEffect(() => {
		const { status, current, total, exported, failedPageNumbers = [] } = progress
		if (status === "running") {
			magicToast.loading({
				key: toastId,
				content: t("detail.selfMedia.export.running", { current, total }),
				duration: 0,
			})
		} else if (status === "done") {
			magicToast.success({
				key: toastId,
				content: failedPageNumbers.length
					? t("detail.selfMedia.export.partialSuccess", {
							exported: exported ?? total - failedPageNumbers.length,
							total,
							failedPages: failedPageNumbers.join(
								t("detail.selfMedia.export.pageSeparator"),
							),
						})
					: t("detail.selfMedia.export.success"),
			})
		} else if (status === "error") {
			magicToast.error({
				key: toastId,
				content: t("detail.selfMedia.export.failed"),
			})
		}
	}, [progress, t, toastId])
}
