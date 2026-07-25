import IconButton from "../../../primitives/custom/IconButton/index"
import styles from "./index.module.css"
import { Download } from "lucide-react"
import { useCanvas } from "../../../../app/providers/CanvasProvider"
import { useCanvasDesignI18n } from "../../../../app/providers/I18nProvider"

export default function DownloadButton() {
	const { canvas } = useCanvas()
	const { t } = useCanvasDesignI18n()
	const label = t("menu.downloadImage", "下载图片")

	const handleDownload = async () => {
		if (!canvas) {
			return
		}

		const selectedIds = canvas.selectionManager.getSelectedIds()
		if (selectedIds.length === 0) {
			return
		}

		await canvas.clipboardManager.downloadElementsAsPNG(selectedIds)
	}

	return (
		<IconButton onClick={handleDownload} className={styles.downloadButton} title={label}>
			<Download size={16} />
			<span className={styles.buttonText}>{label}</span>
		</IconButton>
	)
}
