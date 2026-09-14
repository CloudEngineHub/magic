import * as React from "react"
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"

import { ChevronUp, ChevronDown } from "lucide-react"
import { useReducedMotion } from "framer-motion"

import { cn } from "@/utils/cn"

type ScrollAreaViewportProps = Omit<
	React.ComponentProps<typeof ScrollAreaPrimitive.Viewport>,
	"ref" | "className" | "style" | "id" | "children"
> & {
	[key: `data-${string}`]: string | number | boolean | undefined
}

type ScrollAreaProps = React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
	viewportClassName?: string
	viewportStyle?: React.CSSProperties
	viewportRef?: React.Ref<HTMLDivElement>
	viewportId?: string
	/** Keep scroll events and data attributes on the actual scrolling element. */
	viewportProps?: ScrollAreaViewportProps
	hideScrollbar?: boolean
	/** Show vertical edge shadows only where content remains outside the viewport. */
	scrollShadows?: boolean
	scrollHints?: {
		variant: "arrows" | "both"
		upLabel: string
		downLabel: string
		/** 内容高度依赖本视口时固定预留提示区，避免显隐反过来改变内容高度。 */
		reserveSpace?: boolean
	}
	scrollbarOrientation?: React.ComponentProps<
		typeof ScrollAreaPrimitive.ScrollAreaScrollbar
	>["orientation"]
}

const ScrollArea = React.forwardRef<
	React.ElementRef<typeof ScrollAreaPrimitive.Root>,
	ScrollAreaProps
>(
	(
		{
			className,
			children,
			viewportClassName,
			viewportStyle,
			viewportRef,
			viewportId,
			viewportProps,
			hideScrollbar = false,
			scrollShadows = false,
			scrollHints,
			scrollbarOrientation = "vertical",
			...props
		},
		ref,
	) => {
		const localViewportRef = React.useRef<HTMLDivElement | null>(null)
		const reducedMotion = useReducedMotion()
		const [hasHintSpace, setHasHintSpace] = React.useState(!!scrollHints?.reserveSpace)
		const [edges, setEdges] = React.useState({ top: false, bottom: false })
		const setViewportRef = React.useCallback(
			(node: HTMLDivElement | null) => {
				localViewportRef.current = node
				if (typeof viewportRef === "function") viewportRef(node)
				else if (viewportRef)
					(viewportRef as React.MutableRefObject<HTMLDivElement | null>).current = node
			},
			[viewportRef],
		)
		const showHints = !!scrollHints && scrollbarOrientation === "vertical"
		const reserveHintSpace = showHints && !!scrollHints?.reserveSpace
		const showShadows =
			(scrollHints ? scrollHints.variant === "both" : scrollShadows) &&
			scrollbarOrientation === "vertical"
		const observeEdges = showHints || showShadows
		const scrollPage = (direction: -1 | 1) => {
			const viewport = localViewportRef.current
			viewport?.scrollBy({
				top: direction * viewport.clientHeight * 0.75,
				behavior: reducedMotion ? "auto" : "smooth",
			})
		}
		React.useLayoutEffect(() => {
			const viewport = localViewportRef.current
			if (!observeEdges || !viewport) return
			const measure = () => {
				// 按未扣除提示区的可用高度判断溢出，避免箭头自身导致空列表一直溢出。
				const contentHeight =
					viewport.firstElementChild?.getBoundingClientRect().height ?? 0
				setHasHintSpace(
					reserveHintSpace ||
						(showHints &&
							contentHeight > (viewport.parentElement?.clientHeight ?? 0) + 1),
				)
				// Fractional scroll offsets can leave a subpixel remainder at either edge.
				const top = viewport.scrollTop > 1
				const bottom =
					viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop > 1
				setEdges((previous) =>
					previous.top === top && previous.bottom === bottom ? previous : { top, bottom },
				)
			}
			measure()
			const observer = new ResizeObserver(measure)
			observer.observe(viewport)
			if (viewport.parentElement) observer.observe(viewport.parentElement)
			// Radix's content wrapper changes size when entries load, expand, or wrap.
			if (viewport.firstElementChild) observer.observe(viewport.firstElementChild)
			viewport.addEventListener("scroll", measure, { passive: true })
			return () => {
				observer.disconnect()
				viewport.removeEventListener("scroll", measure)
			}
		}, [observeEdges, showHints, reserveHintSpace])
		return (
			<ScrollAreaPrimitive.Root
				ref={ref}
				data-slot="scroll-area"
				className={cn(
					"relative",
					className,
					showHints && hasHintSpace && "grid grid-rows-[18px_minmax(0,1fr)_18px]",
				)}
				{...props}
			>
				<ScrollAreaPrimitive.Viewport
					{...viewportProps}
					id={viewportId}
					ref={setViewportRef}
					data-slot="scroll-area-viewport"
					className={cn(
						"size-full rounded-[inherit] outline-none transition-[color,box-shadow] focus-visible:outline-1 focus-visible:ring-[3px] focus-visible:ring-ring/50",
						viewportClassName,
						showHints && hasHintSpace && "row-start-2 min-h-0",
					)}
					style={viewportStyle}
				>
					{children}
				</ScrollAreaPrimitive.Viewport>
				{/* Radix enables scrolling on an axis only when its matching scrollbar is mounted. */}
				{/* Hide the control without unmounting it, so wheel and keyboard scrolling remain enabled. */}
				<ScrollBar
					orientation={scrollbarOrientation}
					className={hideScrollbar ? "invisible" : undefined}
				/>
				<ScrollAreaPrimitive.Corner />
				{showHints &&
					hasHintSpace &&
					scrollHints &&
					([-1, 1] as const).map((direction) => {
						const visible = direction < 0 ? edges.top : edges.bottom
						const Icon = direction < 0 ? ChevronUp : ChevronDown
						return (
							<button
								key={direction}
								type="button"
								aria-label={
									direction < 0 ? scrollHints.upLabel : scrollHints.downLabel
								}
								disabled={!visible}
								onClick={() => scrollPage(direction)}
								className={cn(
									"z-10 flex h-[18px] w-6 items-center justify-center justify-self-center rounded-sm text-muted-foreground opacity-[0.65] outline-none transition-opacity hover:opacity-100 focus-visible:ring-1 focus-visible:ring-ring motion-reduce:transition-none",
									direction < 0 ? "row-start-1" : "row-start-3",
									!visible && "invisible",
								)}
							>
								<Icon className="size-3" strokeWidth={1.5} />
							</button>
						)
					})}
				{showShadows && (
					<>
						<div
							aria-hidden
							className={cn(
								"pointer-events-none absolute inset-x-2 top-0 z-10 h-1 bg-gradient-to-b from-black/[0.04] to-transparent dark:from-black/[0.14]",
								showHints &&
									"h-3 from-black/[0.035] transition-opacity [mask-image:linear-gradient(to_right,transparent,black_20%,black_80%,transparent)] motion-reduce:transition-none",
								showHints && hasHintSpace && "top-[18px]",
								!edges.top && "invisible",
							)}
						/>
						<div
							aria-hidden
							className={cn(
								"pointer-events-none absolute inset-x-2 bottom-0 z-10 h-1 bg-gradient-to-t from-black/[0.04] to-transparent dark:from-black/[0.14]",
								showHints &&
									"h-3 from-black/[0.035] transition-opacity [mask-image:linear-gradient(to_right,transparent,black_20%,black_80%,transparent)] motion-reduce:transition-none",
								showHints && hasHintSpace && "bottom-[18px]",
								!edges.bottom && "invisible",
							)}
						/>
					</>
				)}
			</ScrollAreaPrimitive.Root>
		)
	},
)

// @ts-expect-error - displayName is not in the type definition but is valid in runtime
ScrollArea.displayName = "ScrollArea"

function ScrollBar({
	className,
	orientation = "vertical",
	...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
	return (
		<ScrollAreaPrimitive.ScrollAreaScrollbar
			data-slot="scroll-area-scrollbar"
			orientation={orientation}
			className={cn(
				"flex touch-none select-none p-px transition-colors",
				orientation === "vertical" && "h-full w-2.5 border-l border-l-transparent",
				orientation === "horizontal" && "h-2.5 flex-col border-t border-t-transparent",
				className,
			)}
			{...props}
		>
			<ScrollAreaPrimitive.ScrollAreaThumb
				data-slot="scroll-area-thumb"
				className="relative flex-1 rounded-full bg-border"
			/>
		</ScrollAreaPrimitive.ScrollAreaScrollbar>
	)
}

export { ScrollArea, ScrollBar }
