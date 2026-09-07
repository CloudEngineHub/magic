import { memo } from "react"
import type { ElementRect } from "../types"
import { HTML_EDITOR_Z_INDEX } from "../../../constants/z-index"

interface HoverBoxProps {
	rect: ElementRect
	isSelectionMode: boolean
}

/**
 * Hover highlight box
 */
export const HoverBox = memo(function HoverBox({ rect, isSelectionMode }: HoverBoxProps) {
	if (!isSelectionMode) return null

	return (
		<div
			className="absolute border border-dashed border-primary/40 transition-[height,width,transform,opacity] duration-150 ease-out [border-style:dashed] motion-reduce:transition-none"
			style={{
				top: `${rect.top}px`,
				left: `${rect.left}px`,
				width: `${rect.width}px`,
				height: `${rect.height}px`,
				zIndex: HTML_EDITOR_Z_INDEX.OVERLAY.HOVER_HIGHLIGHT,
			}}
		/>
	)
})
