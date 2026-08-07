import IconButton from "../../../primitives/custom/IconButton/index"
import styles from "./index.module.css"
import { Frame } from "lucide-react"
import { useCanvas } from "../../../../app/providers/CanvasProvider"

const TOOLBAR_FRAME_BOUNDS_EXPANSION = 100

export default function FrameCreateButton() {
	const { canvas } = useCanvas()

	const handleCreateFrame = () => {
		if (!canvas) {
			return
		}

		// 使用 UserActionRegistry 执行画框创建
		canvas.userActionRegistry.execute("frame.create", {
			boundsExpansion: TOOLBAR_FRAME_BOUNDS_EXPANSION,
		})
	}

	return (
		<IconButton onClick={handleCreateFrame} className={styles.frameCreateButton}>
			<Frame size={16} />
			<span className={styles.buttonText}>创建画框</span>
		</IconButton>
	)
}
