import IconButton from "../../../primitives/custom/IconButton/index"
import styles from "./index.module.css"
import { Eraser } from "lucide-react"
import { useCanvasDesignI18n } from "../../../../app/providers/I18nProvider"
import { useCanvasUI } from "../../../../app/providers/CanvasUIProvider"
import { useCanvas } from "../../../../app/providers/CanvasProvider"
import { ElementTypeEnum } from "../../../../runtime/document/types"

export default function ImageEraserButton() {
	const { t } = useCanvasDesignI18n()
	const { selectedElements } = useCanvasUI()
	const { canvas } = useCanvas()

	const handleEraser = () => {
		if (!canvas) return

		const imageElement = selectedElements[0]
		if (!imageElement || imageElement.type !== ElementTypeEnum.Image) return

		canvas.eraserManager.enterEraserMode(imageElement.id)
	}

	return (
		<IconButton onClick={handleEraser} className={styles.imageEraserButton}>
			<Eraser size={16} />
			<span className={styles.buttonText}>
				{t("elementTools.imageEraser.title", "橡皮工具")}
			</span>
		</IconButton>
	)
}
