import IconButton from "../../../../primitives/custom/IconButton/index"
import styles from "./index.module.css"
import { Frame } from "lucide-react"
import { useCanvas } from "../../../../../app/providers/CanvasProvider"
import { ElementToolTypeEnum } from "../../../../../public/props"
import { useElementToolResolution } from "../../../model/ElementToolResolutionContext"

export default function FrameCreateButton() {
	const { canvas } = useCanvas()
	const tool = useElementToolResolution()

	const handleCreateFrame = () => {
		if (tool) {
			void tool.execute?.()
			return
		}
		if (!canvas) {
			return
		}

		// 使用 UserActionRegistry 执行画框创建，沿用通用默认 padding
		canvas.userActionRegistry.execute(ElementToolTypeEnum.FrameCreate)
	}

	return (
		<IconButton onClick={handleCreateFrame} className={styles.frameCreateButton}>
			<Frame size={16} />
			<span className={styles.buttonText}>创建画框</span>
		</IconButton>
	)
}
