import * as React from "react"
import { GripVerticalIcon } from "lucide-react"
import * as ResizablePrimitive from "react-resizable-panels"
import { useReducedMotion } from "framer-motion"

import { cn } from "@/utils/cn"

function ResizablePanelGroup({
	className,
	...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelGroup>) {
	return (
		<ResizablePrimitive.PanelGroup
			data-slot="resizable-panel-group"
			className={cn(
				"flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
				className,
			)}
			{...props}
		/>
	)
}

const ResizablePanel = React.forwardRef<
	React.ElementRef<typeof ResizablePrimitive.Panel>,
	React.ComponentProps<typeof ResizablePrimitive.Panel>
>(({ ...props }, ref) => {
	return <ResizablePrimitive.Panel ref={ref} data-slot="resizable-panel" {...props} />
})

function ResizableHandle({
	withHandle,
	className,
	children,
	...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & {
	withHandle?: boolean
}) {
	return (
		<ResizablePrimitive.PanelResizeHandle
			data-slot="resizable-handle"
			className={cn(
				"focus-visible:outline-hidden relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:-translate-y-1/2 data-[panel-group-direction=vertical]:after:translate-x-0 [&[data-panel-group-direction=vertical]>div]:rotate-90",
				className,
			)}
			{...props}
		>
			{children}
			{withHandle && (
				<div className="z-10 flex h-4 w-3 items-center justify-center rounded-xs border bg-border">
					<GripVerticalIcon className="size-2.5" />
				</div>
			)}
		</ResizablePrimitive.PanelResizeHandle>
	)
}

interface ResizableCollapseFeedbackProps {
	dragging: boolean
	collapseProgress: number
	collapseArmed: boolean
	collapseDirection: -1 | 1
	pullLabel: string
	releaseLabel: string
}

/** 只展示收起意图；宽度、阈值和最终收起仍由各面板的拖动生命周期负责。 */
function ResizableCollapseFeedback({
	dragging,
	collapseProgress,
	collapseArmed,
	collapseDirection,
	pullLabel,
	releaseLabel,
}: ResizableCollapseFeedbackProps) {
	const reducedMotion = useReducedMotion()
	return (
		<>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-y-0 w-1 rounded bg-primary"
				style={{
					opacity: collapseProgress,
					transform: `translateX(${collapseDirection * 14 * (1 - Math.exp(-collapseProgress * 3))}px)`,
					transition:
						reducedMotion || dragging
							? "none"
							: "transform 360ms cubic-bezier(.2,1.6,.4,1), opacity 220ms ease",
				}}
			/>
			{dragging && (collapseProgress > 0 || collapseArmed) && (
				<span
					role="status"
					className={cn(
						"pointer-events-none absolute top-1/2 z-30 w-40 rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md",
						collapseArmed && "border-primary",
					)}
					style={{
						transform: `translate(${collapseDirection < 0 ? "25%" : "-25%"}, -200%)`,
					}}
				>
					{collapseArmed ? releaseLabel : pullLabel}
					<span
						aria-hidden="true"
						className="mt-2 block h-0.5 overflow-hidden rounded bg-muted"
					>
						<span
							className="block h-full rounded bg-primary"
							style={{ width: `${collapseProgress * 100}%` }}
						/>
					</span>
				</span>
			)}
		</>
	)
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle, ResizableCollapseFeedback }
