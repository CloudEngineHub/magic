import { Trash2 } from "lucide-react"
import { useCanvas } from "../../../../app/providers/CanvasProvider"
import { useCanvasDesignI18n } from "../../../../app/providers/I18nProvider"
import { useCanvasUI } from "../../../../app/providers/CanvasUIProvider"
import { ElementTypeEnum } from "../../../../runtime/document/types"
import { ImageElement } from "../../../../runtime/elements/image/ImageElement"
import IconButton from "../../../primitives/custom/IconButton/index"
import styles from "../ImageCropButton/index.module.css"

export default function ImageContentDeleteButton() {
	const { canvas } = useCanvas()
	const { selectedElements } = useCanvasUI()
	const { t } = useCanvasDesignI18n()

	const handleDelete = () => {
		if (!canvas || canvas.readonly) return
		const selected = selectedElements[0]
		if (!selected || selected.type !== ElementTypeEnum.Image) return
		const instance = canvas.elementManager.getElementInstance(selected.id)
		if (instance instanceof ImageElement) instance.deleteActiveContent()
	}

	return (
		<IconButton
			onClick={handleDelete}
			disabled={!canvas || canvas.readonly}
			className={styles.imageCropButton}
		>
			<Trash2 size={16} />
			<span className={styles.buttonText}>
				{t("elementTools.imageContentDelete.title", "删除当前内容")}
			</span>
		</IconButton>
	)
}
