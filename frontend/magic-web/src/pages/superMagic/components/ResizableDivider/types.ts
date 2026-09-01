export interface ResizableDividerProps {
	onResizeStart: (clientX: number) => void
	position?: "left" | "right"
	isDragging?: boolean
	onHoverChange?: (isHovering: boolean) => void
	// Offset from left edge when position="right", used to position divider at dynamic width
	offsetLeft?: number
}
