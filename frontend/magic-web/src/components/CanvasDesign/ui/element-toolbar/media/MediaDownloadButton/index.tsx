import { Download } from "lucide-react"
import { useCanvas } from "../../../../app/providers/CanvasProvider"
import { useCanvasDesignI18n } from "../../../../app/providers/I18nProvider"
import IconButton from "../../../primitives/custom/IconButton/index"
import styles from "../../download/DownloadButton/index.module.css"

/** 下载当前选中媒体的原始资源，而不是将元素导出为 PNG。 */
export default function MediaDownloadButton() {
	const { canvas } = useCanvas()
	const { t } = useCanvasDesignI18n()
	const label = t("elementTools.mediaDownload.title", "下载")
	const canDownload = canvas?.userActionRegistry.canExecute("download.image") ?? false

	const handleDownload = async () => {
		if (!canvas || !canDownload) return
		await canvas.userActionRegistry.execute("download.image", {
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
