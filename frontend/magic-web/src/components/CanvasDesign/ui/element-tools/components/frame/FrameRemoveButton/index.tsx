import IconButton from "../../../../primitives/custom/IconButton/index"
import styles from "./index.module.css"
import { FrameDotted } from "../../../../primitives/icons/index"
import { useCanvas } from "../../../../../app/providers/CanvasProvider"
import { ElementToolTypeEnum } from "../../../../../public/props"
import { useElementToolResolution } from "../../../model/ElementToolResolutionContext"

export default function FrameRemoveButton() {
	const { canvas } = useCanvas()
	const tool = useElementToolResolution()

	const handleRemoveFrame = () => {
		if (tool) {
			void tool.execute?.()
			return
		}
		if (!canvas) {
			return
		}

		// 使用 UserActionRegistry 执行画框移除
		canvas.userActionRegistry.execute(ElementToolTypeEnum.FrameRemove)
	}

	return (
		<IconButton onClick={handleRemoveFrame} className={styles.frameRemoveButton}>
			<FrameDotted size={16} />
			<span className={styles.buttonText}>解除画框</span>
		</IconButton>
	)
}
