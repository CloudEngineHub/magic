import { createPortal } from "react-dom"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { StylePanel } from "../StylePanel"
import type { HTMLEditorV2Ref } from "../../iframe-bridge/types/props"
import type { ElementRect } from "../SelectionOverlay/types"
import { getContextPanelPosition } from "./contextPanelPosition"
import { TAILWIND_Z_INDEX_CLASSES } from "../../constants/z-index"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import { useTranslation } from "react-i18next"
import { cn } from "@/utils/cn"
import { X } from "lucide-react"

interface Props {
	editorRef: React.RefObject<HTMLEditorV2Ref>
	anchor: ElementRect | null
	selector?: string
	disabled?: boolean
	open?: boolean
	onClose?: () => void
	/** The canvas column bounds. The DOM tree is rendered outside this area. */
	boundaryRef?: React.RefObject<HTMLElement | null>
}

export function ElementContextPanel({
	editorRef,
	anchor,
	selector,
	disabled,
	open = true,
	onClose,
	boundaryRef,
}: Props) {
	const { t } = useTranslation("super")
	const panelRef = useRef<HTMLDivElement>(null)
	const [position, setPosition] = useState({
		left: 8,
		top: 8,
		width: 360,
		height: 420,
		maxHeight: 720,
	})
	const [isOpen, setIsOpen] = useState(false)
	const hasAnchor = Boolean(open && anchor && selector)
	useEffect(() => {
		if (typeof window === "undefined") return
		if (!hasAnchor) {
			setIsOpen(false)
			return
		}
		setIsOpen(false)
		const frame = window.requestAnimationFrame(() => setIsOpen(true))
		return () => window.cancelAnimationFrame(frame)
	}, [hasAnchor, selector])
	useLayoutEffect(() => {
		if (!anchor || !selector || !panelRef.current) return
		let frame: number | null = null
		const updateNow = () => {
			frame = null
			const boundary = boundaryRef?.current?.getBoundingClientRect()
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
			const panelWidth = Math.min(360, availableWidth)
			const measuredHeight = Math.max(
				panelRef.current?.scrollHeight || 0,
				panelRef.current?.getBoundingClientRect().height || 0,
			)
			const panelHeight = Math.min(
				720,
				Math.max(48, measuredHeight || 420),
				Math.max(48, viewport.height - 16),
			)
			const next = getContextPanelPosition(
				anchor,
				{
					width: panelWidth,
					height: panelHeight,
				},
				viewport,
				8,
			)
			// Give the panel a definite bounded height so its grid row can establish
			// a real viewport for ScrollArea instead of growing with the content.
			const boundedHeight = Math.max(48, Math.min(panelHeight, next.maxHeight))
			const nextPosition = {
				left: next.left,
				top: next.top,
				width: next.width,
				height: boundedHeight,
				maxHeight: boundedHeight,
			}
			setPosition((previous) =>
				previous.left === nextPosition.left &&
				previous.top === nextPosition.top &&
				previous.width === nextPosition.width &&
				previous.height === nextPosition.height &&
				previous.maxHeight === nextPosition.maxHeight
					? previous
					: nextPosition,
			)
		}
		const update = () => {
			if (frame !== null) return
			frame = window.requestAnimationFrame(updateNow)
		}
		const updateFromScroll = (event: Event) => {
			// Scrolling the panel content must not feed back into panel positioning.
			// Only canvas/page scrolling changes the anchor's viewport coordinates.
			if (event.target instanceof Node && panelRef.current?.contains(event.target)) return
			update()
		}
		updateNow()
		window.addEventListener("resize", update)
		window.addEventListener("scroll", updateFromScroll, true)
		const resizeObserver =
			typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update)
		// Do not observe the panel itself. Updating maxHeight changes its measured
		// size and would feed the layout result back into this observer.
		if (boundaryRef?.current) resizeObserver?.observe(boundaryRef.current)
		return () => {
			window.removeEventListener("resize", update)
			window.removeEventListener("scroll", updateFromScroll, true)
			resizeObserver?.disconnect()
			if (frame !== null) window.cancelAnimationFrame(frame)
		}
	}, [anchor, boundaryRef, selector])
	if (!open || !anchor || !selector || typeof document === "undefined") return null
	return createPortal(
		<div
			ref={panelRef}
			data-html-context-panel="true"
			className={cn(
				"pointer-events-none fixed box-border flex max-w-[calc(100vw_-_16px)] translate-y-2 scale-[0.99] flex-col overflow-hidden rounded-xl border bg-card/95 opacity-0 shadow-[0_12px_32px_rgba(0,0,0,0.16)] blur-[2px] backdrop-blur transition-[transform,opacity,filter,height] [transition-duration:400ms] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] data-[open=true]:pointer-events-auto data-[open=true]:translate-y-0 data-[open=true]:scale-100 data-[open=true]:opacity-100 data-[open=true]:blur-0 motion-reduce:transition-none",
				TAILWIND_Z_INDEX_CLASSES.EDITOR_FLOATING.CONTEXT_PANEL,
			)}
			data-open={isOpen}
			style={{
				left: position.left,
				top: position.top,
				width: position.width,
				height: position.height,
				maxHeight: position.maxHeight,
			}}
		>
			{onClose ? (
				<button
					type="button"
					onClick={onClose}
					aria-label={t("stylePanel.closeContextPanel")}
					title={t("stylePanel.closeContextPanel")}
					className="absolute right-2 top-2 z-20 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96]"
				>
					<X className="h-4 w-4" />
				</button>
			) : null}
			<ScrollArea
				type="always"
				className="min-h-0 w-full flex-1 [&_[data-slot='scroll-area-viewport']>div]:!block [&_[data-slot='scroll-area-viewport']>div]:!w-full"
				viewportClassName="h-full max-h-full min-h-0 w-full touch-pan-y overscroll-contain overflow-x-hidden overflow-y-auto"
				viewportStyle={{ overflowX: "hidden", overflowY: "auto" }}
				onWheel={(event) => event.stopPropagation()}
			>
				<div className="w-full min-w-0 px-1.5 pb-1.5 pr-3">
					<StylePanel editorRef={editorRef} variant="context" disabled={disabled} />
				</div>
			</ScrollArea>
		</div>,
		document.body,
	)
}
