import { Download } from "lucide-react"
import IconButton from "../../../primitives/custom/IconButton/index"
import { useCanvas } from "../../../../app/providers/CanvasProvider"
import { useCanvasDesignI18n } from "../../../../app/providers/I18nProvider"
import styles from "../../download/DownloadButton/index.module.css"

export default function FrameDownloadButton() {
	const { canvas } = useCanvas()
	const { t } = useCanvasDesignI18n()
	const label = t("menu.batchDownload", "批量下载")
	const canDownload = canvas?.userActionRegistry.canExecute("download.frame") ?? false

	const handleDownload = async () => {
		if (!canvas || !canDownload) return
		await canvas.userActionRegistry.execute("download.frame", {
			downloadMode: "default",
		})
	}

	return (
		<IconButton
			onClick={handleDownload}
			className={styles.downloadButton}
			title={label}
			disabled={!canDownload}
		>
			<Download size={16} />
			<span className={styles.buttonText}>{label}</span>
		</IconButton>
	)
}
