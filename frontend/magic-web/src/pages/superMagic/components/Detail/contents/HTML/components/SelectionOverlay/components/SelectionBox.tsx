import { memo } from "react"
import type { ElementRect, ResizeHandleConfig } from "../types"
import type { GapAxis, GapHandleFrame } from "../utils/gapHandleLayout"
import { HTML_EDITOR_Z_INDEX } from "../../../constants/z-index"
import { ControlHandles } from "./ControlHandles"
import { SelectionMarks } from "./SelectionMarks"
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
	gapHandles?: GapHandleFrame[]
	onGapHandlePointerDown?: (event: React.PointerEvent, axis: GapAxis) => void
	isGapDragging?: boolean
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
	gapHandles = [],
	onGapHandlePointerDown,
	isGapDragging = false,
	onDelete,
	onDuplicate,
}: SelectionBoxProps) {
	const isOnlySelected = !isMultiSelect
	const showActions = shouldShowActionHandles(transformedRect)

	return (
		<div
			// White + dark rings stay visible on mixed page backgrounds.
			className="group/selection pointer-events-none absolute shadow-[0_0_0_1px_#fff,0_0_0_2px_rgb(0_0_0_/_0.65)]"
			data-testid="html-editor-selection-box"
			style={{
				top: `${transformedRect.top}px`,
				left: `${transformedRect.left}px`,
				width: `${transformedRect.width}px`,
				height: `${transformedRect.height}px`,
				opacity: isMultiSelect ? 0.7 : 1,
				zIndex: HTML_EDITOR_Z_INDEX.OVERLAY.SELECTION_HIGHLIGHT,
				transform,
				transformOrigin: "center center",
			}}
		>
			<SelectionMarks />
			{/* Only show handles in single-select mode */}
			{isOnlySelected && isSelectionMode && (
				<ControlHandles
					isMoving={isMoving}
					onMoveHandleMouseDown={onMoveHandleMouseDown}
					onDuplicate={onDuplicate}
					onDelete={onDelete}
					resizeHandles={resizeHandles}
					onResizeHandleMouseDown={onResizeHandleMouseDown}
					gapHandles={gapHandles}
					onGapHandlePointerDown={onGapHandlePointerDown}
					isGapDragging={isGapDragging}
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
