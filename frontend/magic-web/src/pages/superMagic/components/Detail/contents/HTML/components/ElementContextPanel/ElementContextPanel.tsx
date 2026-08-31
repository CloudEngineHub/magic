import { createPortal } from "react-dom"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { StylePanel } from "../StylePanel"
import type { HTMLEditorV2Ref } from "../../iframe-bridge/types/props"
import type { ElementRect } from "../SelectionOverlay/types"
import { getContextToolbarPosition } from "./contextPanelPosition"
import { TAILWIND_Z_INDEX_CLASSES } from "../../constants/z-index"
import { cn } from "@/utils/cn"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"

interface Props {
	editorRef: React.RefObject<HTMLEditorV2Ref>
	anchor: ElementRect | null
	selector?: string
	disabled?: boolean
	open?: boolean
	/** The canvas column bounds. The DOM tree is rendered outside this area. */
	boundaryRef?: React.RefObject<HTMLElement | null>
}

const CONTEXT_TOOLBAR_WIDTH = 680
const CONTEXT_TOOLBAR_HEIGHT = 48
const CONTEXT_TOOLBAR_CLOSE_DURATION = 240
// The panel width includes its 1px border and 4px horizontal padding on both sides.
// Keep that chrome outside the measured toolbar content so a fit-content toolbar
// does not create a false 10px overflow.
const CONTEXT_TOOLBAR_HORIZONTAL_CHROME = 10

function getVisibleViewport(boundaryRef?: React.RefObject<HTMLElement | null>): {
	left: number
	top: number
	right: number
	bottom: number
} {
	const boundaryRect = boundaryRef?.current?.getBoundingClientRect()
	const boundary =
		boundaryRect && boundaryRect.width > 0 && boundaryRect.height > 0 ? boundaryRect : undefined
	const left = Math.max(0, boundary?.left ?? 0)
	const top = Math.max(0, boundary?.top ?? 0)
	const right = Math.min(window.innerWidth, boundary?.right ?? window.innerWidth)
	const bottom = Math.min(window.innerHeight, boundary?.bottom ?? window.innerHeight)
	return { left, top, right, bottom }
}

function intersectsViewport(
	anchor: ElementRect | null,
	boundaryRef?: React.RefObject<HTMLElement | null>,
): boolean {
	if (!anchor || typeof window === "undefined") return false
	const viewport = getVisibleViewport(boundaryRef)
	return (
		anchor.left < viewport.right &&
		anchor.left + anchor.width > viewport.left &&
		anchor.top < viewport.bottom &&
		anchor.top + anchor.height > viewport.top
	)
}

export function ElementContextPanel({
	editorRef,
	anchor,
	selector,
	disabled,
	open = true,
	boundaryRef,
}: Props) {
	const panelRef = useRef<HTMLDivElement>(null)
	const toolbarContentRef = useRef<HTMLDivElement>(null)
	const toolbarViewportRef = useRef<HTMLDivElement>(null)
	const [position, setPosition] = useState({
		left: 8,
		top: 8,
		width: CONTEXT_TOOLBAR_WIDTH,
		height: CONTEXT_TOOLBAR_HEIGHT,
	})
	const hasAnchor = Boolean(open && anchor && selector)
	const [isOpen, setIsOpen] = useState(false)
	const [shouldRender, setShouldRender] = useState(hasAnchor)
	const [isToolbarOverflowing, setIsToolbarOverflowing] = useState(false)
	const wasVisibleRef = useRef(false)
	const hasVisibleAnchor = intersectsViewport(anchor, boundaryRef)
	const shouldShowPanel = hasAnchor && hasVisibleAnchor
	useEffect(() => {
		if (typeof window === "undefined") return
		if (!shouldShowPanel) {
			wasVisibleRef.current = false
			setIsOpen(false)
			const closeTimer = window.setTimeout(
				() => setShouldRender(false),
				CONTEXT_TOOLBAR_CLOSE_DURATION,
			)
			return () => window.clearTimeout(closeTimer)
		}
		setShouldRender(true)
		// Keep an already visible toolbar open while the selected element changes.
		// This updates its contents and position without replaying the entrance motion.
		if (wasVisibleRef.current) {
			setIsOpen(true)
			return
		}
		wasVisibleRef.current = true
		setIsOpen(false)
		// Let the closed state render for one frame before opening the panel. Without
		// this extra frame, child toolbar transitions can be skipped by the browser.
		let openFrame: number | null = null
		const frame = window.requestAnimationFrame(() => {
			openFrame = window.requestAnimationFrame(() => setIsOpen(true))
		})
		return () => {
			window.cancelAnimationFrame(frame)
			if (openFrame !== null) window.cancelAnimationFrame(openFrame)
		}
	}, [shouldShowPanel])
	useLayoutEffect(() => {
		if (!anchor || !selector || !panelRef.current) return
		let frame: number | null = null
		const updateNow = () => {
			frame = null
			const boundaryRect = boundaryRef?.current?.getBoundingClientRect()
			const boundary =
				boundaryRect && boundaryRect.width > 0 && boundaryRect.height > 0
					? boundaryRect
					: undefined
			const viewport = boundary
				? (() => {
						// A flex canvas can be taller than the visible browser viewport. The
						// floating panel must use the clipped viewport, otherwise a lower
						// element incorrectly appears to have free space below it.
						const left = Math.max(0, boundary.left)
						const top = Math.max(0, boundary.top)
						const right = Math.min(window.innerWidth, boundary.right)
						const bottom = Math.min(window.innerHeight, boundary.bottom)
						return {
							left,
							top,
							width: Math.max(0, right - left),
							height: Math.max(0, bottom - top),
						}
					})()
				: { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
			const availableWidth = Math.max(0, viewport.width - 16)
			const contentWidth = toolbarContentRef.current?.scrollWidth || CONTEXT_TOOLBAR_WIDTH
			// Let the toolbar grow to its measured content width. The viewport becomes
			// scrollable only when the canvas is narrower than the controls themselves;
			// an arbitrary desktop width must not create a scrollbar on a wide canvas.
			const toolbarWidth = Math.min(
				contentWidth + CONTEXT_TOOLBAR_HORIZONTAL_CHROME,
				availableWidth,
			)
			const measuredHeight = Math.max(
				CONTEXT_TOOLBAR_HEIGHT,
				panelRef.current?.getBoundingClientRect().height || 0,
			)
			const next = getContextToolbarPosition(
				anchor,
				{
					width: toolbarWidth,
					height: measuredHeight,
				},
				viewport,
				8,
			)
			const nextPosition = {
				left: next.left,
				top: next.top,
				width: next.width,
				height: measuredHeight,
			}
			setPosition((previous) =>
				previous.left === nextPosition.left &&
				previous.top === nextPosition.top &&
				previous.width === nextPosition.width &&
				previous.height === nextPosition.height
					? previous
					: nextPosition,
			)
		}
		const update = () => {
			if (frame !== null) return
			frame = window.requestAnimationFrame(updateNow)
		}
		const updateOverflow = () => {
			const viewport = toolbarViewportRef.current
			if (!viewport) return
			setIsToolbarOverflowing(viewport.scrollWidth > viewport.clientWidth + 1)
		}
		const updateFromScroll = (event: Event) => {
			// Scrolling the panel content must not feed back into panel positioning.
			// Only canvas/page scrolling changes the anchor's viewport coordinates.
			if (event.target instanceof Node && panelRef.current?.contains(event.target)) return
			update()
		}
		updateNow()
		updateOverflow()
		window.addEventListener("resize", update)
		window.addEventListener("resize", updateOverflow)
		window.addEventListener("scroll", updateFromScroll, true)
		const resizeObserver =
			typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update)
		// Do not observe the panel itself. Updating maxHeight changes its measured
		// size and would feed the layout result back into this observer.
		if (boundaryRef?.current) resizeObserver?.observe(boundaryRef.current)
		if (toolbarContentRef.current) resizeObserver?.observe(toolbarContentRef.current)
		if (toolbarViewportRef.current) resizeObserver?.observe(toolbarViewportRef.current)
		const overflowObserver =
			typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateOverflow)
		if (toolbarContentRef.current) overflowObserver?.observe(toolbarContentRef.current)
		if (toolbarViewportRef.current) overflowObserver?.observe(toolbarViewportRef.current)
		return () => {
			window.removeEventListener("resize", update)
			window.removeEventListener("resize", updateOverflow)
			window.removeEventListener("scroll", updateFromScroll, true)
			resizeObserver?.disconnect()
			overflowObserver?.disconnect()
			if (frame !== null) window.cancelAnimationFrame(frame)
		}
	}, [anchor, boundaryRef, selector, shouldRender])
	if (
		!shouldRender ||
		!shouldShowPanel ||
		!anchor ||
		!selector ||
		typeof document === "undefined"
	)
		return null
	return createPortal(
		<div
			ref={panelRef}
			data-html-context-panel="true"
			className={cn(
				"group/context-toolbar pointer-events-none fixed box-border flex max-w-[calc(100vw_-_16px)] translate-y-2 scale-[0.99] items-center overflow-visible rounded-lg border border-border/60 bg-card/95 p-1 opacity-0 shadow-[0_8px_24px_rgba(0,0,0,0.14)] blur-[2px] backdrop-blur transition-[transform,opacity,filter] [transition-duration:160ms] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] data-[open=true]:pointer-events-auto data-[open=true]:translate-y-0 data-[open=true]:scale-100 data-[open=true]:opacity-100 data-[open=true]:blur-0 motion-reduce:transition-none",
				TAILWIND_Z_INDEX_CLASSES.EDITOR_FLOATING.CONTEXT_PANEL,
			)}
			data-open={isOpen}
			style={{
				left: position.left,
				top: position.top,
				width: position.width,
				height: position.height,
			}}
		>
			<ScrollArea
				type="auto"
				scrollbarOrientation="horizontal"
				className={cn(
					"min-w-0 flex-1",
					// Radix positions the horizontal scrollbar over the viewport. Reserve
					// its height only while the toolbar actually overflows, so buttons
					// remain fully visible without adding empty space in the normal state.
					isToolbarOverflowing && "pb-2.5",
					!isToolbarOverflowing && "[&_[data-slot='scroll-area-scrollbar']]:hidden",
				)}
				viewportClassName="w-full overflow-x-auto overflow-y-hidden"
				viewportRef={toolbarViewportRef}
			>
				<div ref={toolbarContentRef} className="w-max min-w-0">
					<StylePanel
						editorRef={editorRef}
						variant="context"
						disabled={disabled}
						contextToolbarOpen={isOpen}
					/>
				</div>
			</ScrollArea>
		</div>,
		document.body,
	)
}
