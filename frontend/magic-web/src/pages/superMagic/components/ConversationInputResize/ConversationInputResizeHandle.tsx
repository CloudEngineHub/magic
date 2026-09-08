import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type PointerEvent as ReactPointerEvent,
} from "react"
import { cn } from "@/utils/cn"
import {
	ResizeGrip,
	resizeHandleGlowClass,
} from "@/pages/superMagic/components/ResizeGrip/ResizeGrip"

interface ConversationInputResizeHandleProps {
	disabled?: boolean
	/** Allows a page-specific offset while keeping the default handle position unchanged. */
	positionClassName?: string
	value: number
	min: number
	max: number
	onResizeStart: () => void
	onResize: (deltaY: number) => void
	onResizeEnd: () => void
	onDoubleClick: () => void
	onResizeStateChange?: (isResizing: boolean) => void
}

/** Render the grab target and translate pointer movement into height deltas. */
export default function ConversationInputResizeHandle({
	disabled = false,
	positionClassName = "top-0",
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
	const pointerIdRef = useRef<number | null>(null)
	const pointerTargetRef = useRef<HTMLDivElement | null>(null)
	const pendingDeltaRef = useRef<number | null>(null)
	const resizeFrameRef = useRef<number | null>(null)
	const cleanupDragRef = useRef<(() => void) | null>(null)
	const [isDragging, setIsDragging] = useState(false)

	const applyPendingResize = useCallback(() => {
		const pendingDelta = pendingDeltaRef.current
		pendingDeltaRef.current = null
		if (pendingDelta === null || startYRef.current === null) return
		onResize(pendingDelta)
	}, [onResize])

	const handlePointerMove = useCallback(
		(event: PointerEvent) => {
			if (startYRef.current === null) return
			if (pointerIdRef.current !== null && event.pointerId !== pointerIdRef.current) return

			pendingDeltaRef.current = event.clientY - startYRef.current
			if (resizeFrameRef.current !== null) return

			resizeFrameRef.current = window.requestAnimationFrame(() => {
				resizeFrameRef.current = null
				applyPendingResize()
			})
		},
		[applyPendingResize],
	)

	/** Finish a pointer gesture and optionally persist the final height. */
	const finishPointerResize = useCallback(
		(commit: boolean) => {
			if (startYRef.current === null) return

			if (resizeFrameRef.current !== null) {
				window.cancelAnimationFrame(resizeFrameRef.current)
				resizeFrameRef.current = null
			}
			if (commit) applyPendingResize()
			else pendingDeltaRef.current = null

			const pointerId = pointerIdRef.current ?? -1
			if (pointerTargetRef.current?.hasPointerCapture?.(pointerId)) {
				pointerTargetRef.current.releasePointerCapture?.(pointerId)
			}
			startYRef.current = null
			pointerIdRef.current = null
			pointerTargetRef.current = null
			pendingDeltaRef.current = null
			setIsDragging(false)
			onResizeStateChange?.(false)
			if (commit) onResizeEnd()
		},
		[applyPendingResize, onResizeEnd, onResizeStateChange],
	)

	const handlePointerDown = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			if (
				disabled ||
				event.isPrimary === false ||
				(event.pointerType === "mouse" && event.button !== 0)
			) {
				return
			}

			cleanupDragRef.current?.()
			event.preventDefault()
			pointerIdRef.current = event.pointerId
			pointerTargetRef.current = event.currentTarget
			startYRef.current = event.clientY
			pendingDeltaRef.current = null
			event.currentTarget.setPointerCapture?.(event.pointerId)
			setIsDragging(true)
			onResizeStateChange?.(true)
			onResizeStart()

			const handlePointerUp = () => {
				finishPointerResize(true)
				cleanupDragRef.current?.()
			}
			const handlePointerCancel = () => {
				finishPointerResize(false)
				cleanupDragRef.current?.()
			}
			cleanupDragRef.current = () => {
				window.removeEventListener("pointermove", handlePointerMove)
				window.removeEventListener("pointerup", handlePointerUp)
				window.removeEventListener("pointercancel", handlePointerCancel)
				cleanupDragRef.current = null
			}
			window.addEventListener("pointermove", handlePointerMove)
			window.addEventListener("pointerup", handlePointerUp)
			window.addEventListener("pointercancel", handlePointerCancel)
		},
		[disabled, finishPointerResize, handlePointerMove, onResizeStart, onResizeStateChange],
	)

	useEffect(() => {
		return () => {
			cleanupDragRef.current?.()
			if (resizeFrameRef.current !== null) {
				window.cancelAnimationFrame(resizeFrameRef.current)
				resizeFrameRef.current = null
			}
			pendingDeltaRef.current = null
		}
	}, [])

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
				"group absolute inset-x-0 z-10 flex h-3 items-center justify-center bg-transparent",
				positionClassName,
				"cursor-row-resize touch-none select-none",
				resizeHandleGlowClass("horizontal"),
				disabled && "pointer-events-none",
			)}
			onPointerDown={handlePointerDown}
			onDoubleClick={handleDoubleClick}
		>
			<ResizeGrip orientation="horizontal" />
		</div>
	)
}
