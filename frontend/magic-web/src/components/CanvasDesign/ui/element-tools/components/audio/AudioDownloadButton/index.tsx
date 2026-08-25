import { Download } from "lucide-react"
import IconButton from "../../../../primitives/custom/IconButton/index"
import { useCanvas } from "../../../../../app/providers/CanvasProvider"
import { useCanvasDesignI18n } from "../../../../../app/providers/I18nProvider"
import styles from "../../common/DownloadButton/index.module.css"
import { useElementToolResolution } from "../../../model/ElementToolResolutionContext"

export default function AudioDownloadButton() {
	const { canvas } = useCanvas()
	const { t } = useCanvasDesignI18n()
	const tool = useElementToolResolution()
	const label = t("menu.downloadAudio", "下载音频")
	const canDownload = tool
		? tool.visibility === "visible"
		: (canvas?.userActionRegistry.canExecute("download.image") ?? false)

	const handleDownload = async () => {
		if (!canDownload) return
		if (tool) {
			await tool.execute?.({ downloadMode: "default" })
			return
		}
		if (!canvas) return
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
