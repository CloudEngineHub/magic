import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react"
import { cn } from "@/utils/cn"

interface ConversationInputResizeHandleProps {
	disabled?: boolean
	value: number
	min: number
	max: number
	onResizeStart: () => void
	onResize: (deltaY: number) => void
	onResizeEnd: () => void
	onDoubleClick: () => void
	onResizeStateChange?: (isResizing: boolean) => void
}

/** Render the desktop-only grab target and translate pointer movement into height deltas. */
export default function ConversationInputResizeHandle({
	disabled = false,
	value,
	min,
	max,
	onResizeStart,
	onResize,
	onResizeEnd,
	onDoubleClick,
	onResizeStateChange,
}: ConversationInputResizeHandleProps) {
	const startYRef = useRef<number | null>(null)
	const pendingDeltaRef = useRef<number | null>(null)
	const resizeFrameRef = useRef<number | null>(null)
	const [isDragging, setIsDragging] = useState(false)

	const applyPendingResize = useCallback(() => {
		const pendingDelta = pendingDeltaRef.current
		pendingDeltaRef.current = null
		if (pendingDelta === null || startYRef.current === null) return
		onResize(pendingDelta)
	}, [onResize])

	const handleMouseMove = useCallback(
		(event: MouseEvent) => {
			if (startYRef.current === null) return

			pendingDeltaRef.current = event.clientY - startYRef.current
			if (resizeFrameRef.current !== null) return

			resizeFrameRef.current = window.requestAnimationFrame(() => {
				resizeFrameRef.current = null
				applyPendingResize()
			})
		},
		[applyPendingResize],
	)

	const stopMouseResize = useCallback(() => {
		if (startYRef.current === null) return

		if (resizeFrameRef.current !== null) {
			window.cancelAnimationFrame(resizeFrameRef.current)
			resizeFrameRef.current = null
		}
		applyPendingResize()
		startYRef.current = null
		pendingDeltaRef.current = null
		setIsDragging(false)
		onResizeStateChange?.(false)
		window.removeEventListener("mousemove", handleMouseMove)
		window.removeEventListener("mouseup", stopMouseResize)
		onResizeEnd()
	}, [applyPendingResize, handleMouseMove, onResizeEnd, onResizeStateChange])

	const handleMouseDown = useCallback(
		(event: ReactMouseEvent<HTMLDivElement>) => {
			if (disabled || event.button !== 0) return

			event.preventDefault()
			startYRef.current = event.clientY
			pendingDeltaRef.current = null
			setIsDragging(true)
			onResizeStateChange?.(true)
			onResizeStart()
			window.addEventListener("mousemove", handleMouseMove)
			window.addEventListener("mouseup", stopMouseResize)
		},
		[disabled, handleMouseMove, onResizeStart, onResizeStateChange, stopMouseResize],
	)

	useEffect(() => {
		return () => {
			if (resizeFrameRef.current !== null) {
				window.cancelAnimationFrame(resizeFrameRef.current)
				resizeFrameRef.current = null
			}
			pendingDeltaRef.current = null
			window.removeEventListener("mousemove", handleMouseMove)
			window.removeEventListener("mouseup", stopMouseResize)
		}
	}, [handleMouseMove, stopMouseResize])

	const handleDoubleClick = useCallback(() => {
		if (disabled) return
		onDoubleClick()
	}, [disabled, onDoubleClick])

	return (
		<div
			role="separator"
			aria-orientation="horizontal"
			aria-valuemin={min}
			aria-valuemax={max}
			aria-valuenow={value}
			aria-label="Resize conversation input"
			data-resizing={isDragging}
			data-testid="conversation-input-resize-handle"
			className={cn(
				"group absolute inset-x-0 top-0 z-10 flex h-2 overflow-hidden",
				"cursor-row-resize touch-none select-none items-center justify-center",
				"before:pointer-events-none before:absolute before:inset-0",
				"before:bg-gradient-to-r before:from-[rgba(239,246,255,0)] before:via-[rgba(210,230,255,1)] before:to-[rgba(239,246,255,0)]",
				"before:opacity-0 before:transition-opacity before:duration-200 before:content-['']",
				"hover:before:opacity-100 data-[resizing=true]:before:opacity-100",
				disabled && "pointer-events-none",
			)}
			onMouseDown={handleMouseDown}
			onDoubleClick={handleDoubleClick}
		>
			{/* Keep the two-line indicator inside the clipped input panel so both lines stay visible. */}
			<div className="pointer-events-none relative z-10 flex w-5 flex-col gap-0.5">
				<div className="h-px w-full rounded-xs bg-muted-foreground transition-colors duration-200 group-hover:bg-primary group-data-[resizing=true]:bg-primary" />
				<div className="h-px w-full rounded-xs bg-muted-foreground transition-colors duration-200 group-hover:bg-primary group-data-[resizing=true]:bg-primary" />
			</div>
		</div>
	)
}
