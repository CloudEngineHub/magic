import { memo } from "react"
import type { ElementRect, ResizeHandleConfig } from "../types"
import { HTML_EDITOR_Z_INDEX } from "../../../constants/z-index"
import { ControlHandles } from "./ControlHandles"
import { shouldShowActionHandles } from "../utils/size-detection"

interface SelectionBoxProps {
	/** Overlay-local rect used for drawing absolute-positioned UI. */
	transformedRect: ElementRect
	/** Viewport rect used by pointer interactions such as rotation. */
	viewportRect: ElementRect
	isMultiSelect: boolean
	isSelectionMode: boolean
	transform: string | undefined
	// Control handles props
	containerElement: HTMLElement | null
	isMoving: boolean
	rotation: number
	resizeHandles: ResizeHandleConfig[]
	onMoveHandleMouseDown: (event: React.PointerEvent) => void
	onRotateHandleMouseDown: (
		event: React.PointerEvent,
		rect: ElementRect,
		containerElement: HTMLElement | null,
	) => void
	onResizeHandleMouseDown: (event: React.PointerEvent, handle: ResizeHandleConfig) => void
	onDelete: (event: React.PointerEvent) => void
	onDuplicate: (event: React.PointerEvent) => void
}

/**
 * Single selection box with optional control handles
 */
export const SelectionBox = memo(function SelectionBox({
	transformedRect,
	viewportRect,
	isMultiSelect,
	isSelectionMode,
	transform,
	containerElement,
	isMoving,
	rotation,
	resizeHandles,
	onMoveHandleMouseDown,
	onRotateHandleMouseDown,
	onResizeHandleMouseDown,
	onDelete,
	onDuplicate,
}: SelectionBoxProps) {
	const isOnlySelected = !isMultiSelect
	const showActions = shouldShowActionHandles(transformedRect)

	return (
		<div
			className="pointer-events-none absolute border-2 border-primary"
			style={{
				top: `${transformedRect.top}px`,
				left: `${transformedRect.left}px`,
				width: `${transformedRect.width}px`,
				height: `${transformedRect.height}px`,
				opacity: isMultiSelect ? 0.7 : 1,
				boxShadow: isMultiSelect
					? "0 0 0 2px rgb(var(--primary-rgb) / 0.1)"
					: "0 0 0 4px rgb(var(--primary-rgb) / 0.1)",
				zIndex: HTML_EDITOR_Z_INDEX.OVERLAY.SELECTION_HIGHLIGHT,
				transform,
				transformOrigin: "center center",
			}}
		>
			{/* Only show handles in single-select mode */}
			{isOnlySelected && isSelectionMode && (
				<ControlHandles
					isMoving={isMoving}
					onMoveHandleMouseDown={onMoveHandleMouseDown}
					onDuplicate={onDuplicate}
					onDelete={onDelete}
					resizeHandles={resizeHandles}
					onResizeHandleMouseDown={onResizeHandleMouseDown}
					rotation={rotation}
					onRotateHandleMouseDown={onRotateHandleMouseDown}
					transformedRect={viewportRect}
					containerElement={containerElement}
					showActionHandles={showActions}
				/>
			)}
		</div>
	)
})
