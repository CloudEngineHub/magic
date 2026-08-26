import { memo, useState } from "react"
import ReactDOM from "react-dom"
import { cn } from "@/utils/cn"
import { ResizableDividerProps } from "./types"

function ResizableDivider({
	onResizeStart,
	position = "left",
	onHoverChange,
	offsetLeft,
}: ResizableDividerProps) {
	const [isDragging, setIsDragging] = useState(false)
	const [isHovering, setIsHovering] = useState(false)

	const handleMouseEnter = () => {
		setIsHovering(true)
		onHoverChange?.(true)
	}

	const handleMouseLeave = () => {
		setIsHovering(false)
		onHoverChange?.(false)
	}

	const handlePointerDown = (e: React.PointerEvent) => {
		e.preventDefault()
		setIsDragging(true)
		onResizeStart(e.clientX)
	}

	// Forward pointermove events from the overlay to document.
	const handleOverlayMouseMove = (e: React.PointerEvent) => {
		// Create and dispatch a native PointerEvent on document.
		const pointerEvent = new PointerEvent("pointermove", {
			clientX: e.clientX,
			clientY: e.clientY,
			bubbles: true,
			cancelable: true,
		})
		document.dispatchEvent(pointerEvent)
	}

	// Forward pointerup events from the overlay to document.
	const handleOverlayMouseUp = (e: React.PointerEvent) => {
		setIsDragging(false)
		const pointerEvent = new PointerEvent("pointerup", {
			clientX: e.clientX,
			clientY: e.clientY,
			bubbles: true,
			cancelable: true,
		})
		document.dispatchEvent(pointerEvent)
	}

	// Calculate inline style for dynamic positioning
	const dividerStyle =
		position === "right" && offsetLeft !== undefined
			? { left: `${offsetLeft + 6}px`, right: "auto" }
			: position === "left" && offsetLeft !== undefined
				? { right: `${offsetLeft}px`, left: "auto" }
				: undefined

	const shouldShowActive = isDragging || isHovering

	return (
		<>
			<div
				className={cn(
					// Base styles
					"absolute top-0 flex h-full w-3 cursor-ew-resize items-center justify-center transition-opacity duration-200",
					// Position-specific styles
					position === "left" ? "-left-1.5" : position === "right" ? "-right-1.5" : "",
					// Center line (using before pseudo-element via arbitrary variants)
					"before:h-full before:w-px before:transition-colors before:duration-200 before:content-['']",
					// Active state - show primary color
					shouldShowActive
						? "before:bg-neutral-400"
						: "before:bg-transparent hover:before:bg-primary",
				)}
				style={dividerStyle}
				onPointerDown={handlePointerDown}
				onMouseEnter={handleMouseEnter}
				onMouseLeave={handleMouseLeave}
				data-testid="handle-mouse-down"
			/>
			{/* 拖拽时的全局遮罩层，通过 Portal 渲染到 body */}
			{isDragging &&
				ReactDOM.createPortal(
					<div
						className="fixed inset-0 z-[9999] cursor-ew-resize select-none bg-transparent"
						onMouseMove={handleOverlayMouseMove}
						onMouseUp={handleOverlayMouseUp}
						data-testid="handle-overlay-mouse-move"
					/>,
					document.body,
				)}
		</>
	)
}

export default memo(ResizableDivider)
