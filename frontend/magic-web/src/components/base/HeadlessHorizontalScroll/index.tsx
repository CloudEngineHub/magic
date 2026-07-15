import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/shadcn-ui/button"
import { cn } from "@/lib/utils"
import type { HTMLAttributes, MouseEventHandler, ReactNode, RefObject } from "react"

type ScrollDirection = "left" | "right"
const DRAG_START_DISTANCE = 4
const CONTROL_OVERLAY_WIDTH_CLASS = "w-20"
const LEFT_CONTROL_GRADIENT_CLASS =
	"bg-[linear-gradient(to_left,_transparent_0%,_var(--control-background)_50%,_var(--control-background)_100%)]"
const RIGHT_CONTROL_GRADIENT_CLASS =
	"bg-[linear-gradient(to_right,_transparent_0%,_var(--control-background)_50%,_var(--control-background)_100%)]"

interface DragState {
	pointerId: number
	startX: number
	startY: number
	startScrollLeft: number
	isDragging: boolean
}

interface HeadlessHorizontalScrollRenderProps {
	scroll: (direction: ScrollDirection) => void
	showLeftArrow: boolean
	showRightArrow: boolean
	scrollContainerRef: RefObject<HTMLDivElement>
}

interface HeadlessHorizontalScrollProps {
	className?: string
	style?: React.CSSProperties
	controlBackground?: string
	"data-testid"?: string
	scrollContainerClassName?: string
	scrollContainerProps?: Omit<
		HTMLAttributes<HTMLDivElement>,
		"children" | "className" | "ref" | "onContextMenu"
	>
	scrollContainerRef?: RefObject<HTMLDivElement>
	onScrollContainerContextMenu?: MouseEventHandler<HTMLDivElement>
	children: ReactNode
	scrollStep?: number
	hideScrollbar?: boolean
	renderLeftControl?: (props: HeadlessHorizontalScrollRenderProps) => ReactNode
	renderRightControl?: (props: HeadlessHorizontalScrollRenderProps) => ReactNode
}

function defaultRenderLeftControl({ scroll }: HeadlessHorizontalScrollRenderProps) {
	return (
		<div
			className={cn(
				"pointer-events-none absolute left-0 top-0 z-10 h-full overflow-hidden rounded-l-full ",
				CONTROL_OVERLAY_WIDTH_CLASS,
			)}
		>
			<div className={cn("absolute inset-0 rounded-l-full", LEFT_CONTROL_GRADIENT_CLASS)} />
			<div className="relative flex h-full items-center justify-start pl-2">
				<Button
					variant="outline"
					size="icon"
					className="pointer-events-auto !size-4 shrink-0 rounded-full border-muted-foreground/50 text-muted-foreground/50 shadow-xs [&_svg]:size-3"
					onClick={() => scroll("left")}
				>
					<ChevronLeft />
				</Button>
			</div>
		</div>
	)
}

function defaultRenderRightControl({ scroll }: HeadlessHorizontalScrollRenderProps) {
	return (
		<div
			className={cn(
				"pointer-events-none absolute right-0 top-0 z-10 h-full overflow-hidden rounded-r-full ",
				CONTROL_OVERLAY_WIDTH_CLASS,
			)}
		>
			<div className={cn("absolute inset-0 rounded-r-full", RIGHT_CONTROL_GRADIENT_CLASS)} />
			<div className="relative flex h-full items-center justify-end pr-2">
				<Button
					variant="outline"
					size="icon"
					className="pointer-events-auto !size-4 shrink-0 rounded-full border-muted-foreground/50 text-muted-foreground/50 shadow-xs [&_svg]:size-3"
					onClick={() => scroll("right")}
				>
					<ChevronRight />
				</Button>
			</div>
		</div>
	)
}

function HeadlessHorizontalScroll({
	className,
	style,
	controlBackground = "rgb(var(--background-rgb))",
	"data-testid": dataTestId,
	scrollContainerClassName,
	scrollContainerProps,
	scrollContainerRef: externalScrollContainerRef,
	onScrollContainerContextMenu,
	children,
	scrollStep = 200,
	hideScrollbar = true,
	renderLeftControl = defaultRenderLeftControl,
	renderRightControl = defaultRenderRightControl,
}: HeadlessHorizontalScrollProps) {
	const internalScrollContainerRef = useRef<HTMLDivElement>(null)
	const scrollContainerRef = externalScrollContainerRef ?? internalScrollContainerRef
	const [showLeftArrow, setShowLeftArrow] = useState(false)
	const [showRightArrow, setShowRightArrow] = useState(false)
	const [isDragging, setIsDragging] = useState(false)

	const checkScrollPosition = useCallback(() => {
		const container = scrollContainerRef.current
		if (!container) return

		const { scrollLeft, scrollWidth, clientWidth } = container
		setShowLeftArrow(scrollLeft > 0)
		setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 1)
	}, [scrollContainerRef])

	const scroll = useCallback(
		(direction: ScrollDirection) => {
			const container = scrollContainerRef.current
			if (!container) return

			const targetScroll =
				direction === "left"
					? container.scrollLeft - scrollStep
					: container.scrollLeft + scrollStep

			container.scrollTo({
				left: targetScroll,
				behavior: "smooth",
			})
		},
		[scrollContainerRef, scrollStep],
	)

	useEffect(() => {
		checkScrollPosition()
		const container = scrollContainerRef.current
		if (!container) return
		let dragState: DragState | null = null
		let suppressClick = false
		let clearClickSuppressionTimer: ReturnType<typeof setTimeout> | null = null

		container.addEventListener("scroll", checkScrollPosition, { passive: true })
		const resizeObserver =
			typeof ResizeObserver !== "undefined" ? new ResizeObserver(checkScrollPosition) : null
		resizeObserver?.observe(container)

		window.addEventListener("resize", checkScrollPosition)

		function handlePointerDown(event: PointerEvent) {
			if (event.isPrimary === false || event.button !== 0) return
			if (container.scrollWidth <= container.clientWidth) return

			dragState = {
				pointerId: event.pointerId,
				startX: event.clientX,
				startY: event.clientY,
				startScrollLeft: container.scrollLeft,
				isDragging: false,
			}
		}

		function handlePointerMove(event: PointerEvent) {
			if (!dragState || dragState.pointerId !== event.pointerId) return

			const deltaX = event.clientX - dragState.startX
			const deltaY = event.clientY - dragState.startY

			if (!dragState.isDragging) {
				if (Math.abs(deltaX) < DRAG_START_DISTANCE) return
				if (Math.abs(deltaX) <= Math.abs(deltaY)) return

				dragState.isDragging = true
				container.setPointerCapture?.(event.pointerId)
				setIsDragging(true)
			}

			event.preventDefault()
			container.scrollLeft = dragState.startScrollLeft - deltaX
		}

		function finishDrag(event: PointerEvent, shouldSuppressClick: boolean) {
			if (!dragState || dragState.pointerId !== event.pointerId) return

			const didDrag = dragState.isDragging
			dragState = null
			setIsDragging(false)

			if (container.hasPointerCapture?.(event.pointerId)) {
				container.releasePointerCapture(event.pointerId)
			}

			if (didDrag && shouldSuppressClick) {
				suppressClick = true
				clearClickSuppressionTimer = setTimeout(() => {
					suppressClick = false
					clearClickSuppressionTimer = null
				}, 0)
			}
		}

		function handlePointerUp(event: PointerEvent) {
			finishDrag(event, true)
		}

		function handlePointerCancel(event: PointerEvent) {
			finishDrag(event, false)
		}

		function handleClick(event: MouseEvent) {
			if (!suppressClick) return

			suppressClick = false
			if (clearClickSuppressionTimer) {
				clearTimeout(clearClickSuppressionTimer)
				clearClickSuppressionTimer = null
			}
			event.preventDefault()
			event.stopPropagation()
		}

		container.addEventListener("pointerdown", handlePointerDown)
		container.addEventListener("pointermove", handlePointerMove)
		container.addEventListener("pointerup", handlePointerUp)
		container.addEventListener("pointercancel", handlePointerCancel)
		container.addEventListener("lostpointercapture", handlePointerCancel)
		container.addEventListener("click", handleClick, true)

		return () => {
			container.removeEventListener("scroll", checkScrollPosition)
			container.removeEventListener("pointerdown", handlePointerDown)
			container.removeEventListener("pointermove", handlePointerMove)
			container.removeEventListener("pointerup", handlePointerUp)
			container.removeEventListener("pointercancel", handlePointerCancel)
			container.removeEventListener("lostpointercapture", handlePointerCancel)
			container.removeEventListener("click", handleClick, true)
			if (clearClickSuppressionTimer) clearTimeout(clearClickSuppressionTimer)
			resizeObserver?.disconnect()
			window.removeEventListener("resize", checkScrollPosition)
		}
	}, [checkScrollPosition, scrollContainerRef])

	useEffect(() => {
		const frameId = setTimeout(checkScrollPosition, 100)
		return () => clearTimeout(frameId)
	}, [children, checkScrollPosition])

	const renderProps: HeadlessHorizontalScrollRenderProps = {
		scroll,
		showLeftArrow,
		showRightArrow,
		scrollContainerRef,
	}

	return (
		<div
			className={cn("relative overflow-hidden rounded-full", className)}
			style={
				{
					"--control-background": controlBackground,
					...style,
				} as React.CSSProperties
			}
			data-testid={dataTestId}
		>
			{showLeftArrow && renderLeftControl(renderProps)}
			<div
				{...scrollContainerProps}
				ref={scrollContainerRef}
				className={cn(
					hideScrollbar && "no-scrollbar",
					"min-w-0 touch-pan-y overflow-x-auto",
					(showLeftArrow || showRightArrow) && "cursor-grab",
					isDragging && "cursor-grabbing select-none",
					scrollContainerClassName,
				)}
				onContextMenu={onScrollContainerContextMenu}
			>
				{children}
			</div>
			{showRightArrow && renderRightControl(renderProps)}
		</div>
	)
}

export default HeadlessHorizontalScroll
