import { useLayoutEffect, useRef } from "react"
import { LoaderCircle } from "lucide-react"
import { cn } from "../../../runtime/shared/lib/utils"
import { ReferenceSlotVideoIcon } from "../../primitives/icons/index"
import styles from "../../editors/message/index.module.css"
import { useReferenceVideoPoster } from "./useReferenceVideoPoster"

export interface ReferenceVideoPosterPreviewProps {
	fileName: string
	path: string
	fillParent?: boolean
	objectFit?: "cover" | "contain"
}

/** 视频参考槽位：与画布同源，用 VideoResourceManager 解码首帧海报 */
export function ReferenceVideoPosterPreview(props: ReferenceVideoPosterPreviewProps) {
	const { fileName, path, fillParent, objectFit = "cover" } = props
	const { loadState, posterClone } = useReferenceVideoPoster(path)
	const canvasRef = useRef<HTMLCanvasElement>(null)

	useLayoutEffect(() => {
		const el = canvasRef.current
		if (!el || !posterClone || loadState !== "ready") return
		el.width = posterClone.width
		el.height = posterClone.height
		const ctx = el.getContext("2d")
		if (!ctx) return
		ctx.clearRect(0, 0, el.width, el.height)
		ctx.drawImage(posterClone, 0, 0)
	}, [posterClone, loadState])

	const previewWrapperClass = cn(
		styles.referenceImagePreview,
		fillParent && styles.referenceImagePreviewFill,
		fillParent && objectFit === "contain" && styles.referenceImagePreviewFillContain,
	)

	if (loadState === "loading") {
		return (
			<div className={previewWrapperClass}>
				<div className={styles.referenceImageLoading}>
					<LoaderCircle size={12} className={styles.loadingIcon} />
				</div>
			</div>
		)
	}

	if (loadState === "error" || !posterClone) {
		return (
			<div className={previewWrapperClass}>
				<div className="flex h-full w-full items-center justify-center bg-muted/40">
					<ReferenceSlotVideoIcon size={28} />
				</div>
			</div>
		)
	}

	return (
		<div className={previewWrapperClass}>
			<canvas
				ref={canvasRef}
				className={styles.referenceImagePreviewImgCover}
				role="img"
				aria-label={fileName}
			/>
		</div>
	)
}
