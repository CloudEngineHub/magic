import * as React from "react"
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"

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
			scrollbarOrientation = "vertical",
			...props
		},
		ref,
	) => {
		const localViewportRef = React.useRef<HTMLDivElement | null>(null)
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
		const showShadows = scrollShadows && scrollbarOrientation === "vertical"
		React.useLayoutEffect(() => {
			const viewport = localViewportRef.current
			if (!showShadows || !viewport) return
			const measure = () => {
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
			// Radix's content wrapper changes size when entries load, expand, or wrap.
			if (viewport.firstElementChild) observer.observe(viewport.firstElementChild)
			viewport.addEventListener("scroll", measure, { passive: true })
			return () => {
				observer.disconnect()
				viewport.removeEventListener("scroll", measure)
			}
		}, [showShadows])
		return (
			<ScrollAreaPrimitive.Root
				ref={ref}
				data-slot="scroll-area"
				className={cn("relative", className)}
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
				{showShadows && (
					<>
						<div
							aria-hidden
							className={cn(
								"pointer-events-none absolute inset-x-2 top-0 z-10 h-1 bg-gradient-to-b from-black/[0.04] to-transparent dark:from-black/[0.14]",
								!edges.top && "invisible",
							)}
						/>
						<div
							aria-hidden
							className={cn(
								"pointer-events-none absolute inset-x-2 bottom-0 z-10 h-1 bg-gradient-to-t from-black/[0.04] to-transparent dark:from-black/[0.14]",
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
