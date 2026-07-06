import IconButton from "../../../primitives/custom/IconButton/index"
import styles from "./index.module.css"
import { Download } from "lucide-react"
import { useCanvas } from "../../../../app/providers/CanvasProvider"

export default function DownloadButton() {
	const { canvas } = useCanvas()

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
		<IconButton onClick={handleDownload} className={styles.downloadButton}>
			<Download size={16} />
		</IconButton>
	)
}
