import {
	useEffect,
	useState,
	type CSSProperties,
	type PointerEvent as ReactPointerEvent,
} from "react"
import ReactDOM from "react-dom"
import { useTranslation } from "react-i18next"
import { cn } from "@/utils/cn"
import { useReducedMotion } from "framer-motion"

interface TopicResizeHandleProps {
	className?: string
	disabled?: boolean
	onResizeStart: (clientX: number) => void
	style?: CSSProperties
	dragging?: boolean
	collapseProgress?: number
	collapseArmed?: boolean
	collapseDirection?: -1 | 1
}

/** Keeps the layout divider narrow while exposing a wider pointer target for reliable resizing. */
function TopicResizeHandle({
	className,
	disabled = false,
	onResizeStart,
	style,
	dragging,
	collapseProgress = 0,
	collapseArmed = false,
	collapseDirection = 1,
}: TopicResizeHandleProps) {
	const { t } = useTranslation("super")
	const reducedMotion = useReducedMotion()
	const [localDragging, setIsDragging] = useState(false)
	const isDragging = dragging ?? localDragging

	/** Starts resize from a unified pointer event so mouse, trackpad, and touch share one path. */
	const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (disabled || event.button !== 0) return
		event.preventDefault()
		setIsDragging(true)
		onResizeStart(event.clientX)
	}

	useEffect(() => {
		if (!isDragging) return

		/** Clears visual dragging state when the active pointer ends or is cancelled by the browser. */
		const handlePointerEnd = () => {
			setIsDragging(false)
		}

		document.addEventListener("pointerup", handlePointerEnd)
		document.addEventListener("pointercancel", handlePointerEnd)
		return () => {
			document.removeEventListener("pointerup", handlePointerEnd)
			document.removeEventListener("pointercancel", handlePointerEnd)
		}
	}, [isDragging])

	return (
		<>
			<div
				style={style}
				data-slot="resizable-handle"
				onPointerDown={handlePointerDown}
				className={cn(
					"focus-visible:outline-hidden relative flex w-px items-center justify-center bg-border focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full [&[data-panel-group-direction=vertical]>div]:rotate-90",
					"group relative flex !w-2 cursor-col-resize touch-none items-center justify-center !bg-transparent",
					"overflow-visible before:pointer-events-none before:absolute before:inset-0 before:z-0",
					"before:bg-gradient-to-b before:from-[rgba(239,246,255,0)] before:via-[rgba(210,230,255,1)] before:to-[rgba(239,246,255,0)]",
					"before:opacity-0 before:transition-opacity before:duration-200 hover:before:opacity-100",
					"data-[panel-group-direction=vertical]:!h-2 data-[panel-group-direction=vertical]:!w-full",
					"data-[panel-group-direction=vertical]:before:bg-gradient-to-r",
					disabled && "pointer-events-none opacity-0",
					className,
				)}
				data-testid="handle-mouse-down"
				data-pointer-testid="handle-pointer-down"
			>
				<div
					className="absolute inset-y-0 left-1/2 z-20 w-4 -translate-x-1/2 cursor-col-resize touch-none"
					data-testid="resize-handle-hit-area"
					aria-hidden="true"
				/>
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-y-0 w-1 rounded bg-primary"
					style={{
						opacity: collapseProgress,
						transform: `translateX(${collapseDirection * 14 * (1 - Math.exp(-collapseProgress * 3))}px)`,
						transition:
							reducedMotion || isDragging
								? "none"
								: "transform 360ms cubic-bezier(.2,1.6,.4,1), opacity 220ms ease",
					}}
				/>
				{isDragging && (collapseProgress > 0 || collapseArmed) && (
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
						{collapseArmed
							? t("sidebarPanels.releaseToCollapse")
							: t("sidebarPanels.pullToCollapse")}
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
				<div className="pointer-events-none relative z-10 flex h-5 shrink-0 items-center justify-center gap-0.5 data-[panel-group-direction=vertical]:h-auto data-[panel-group-direction=vertical]:w-5 data-[panel-group-direction=vertical]:flex-col">
					<div className="h-full w-px shrink-0 rounded-xs bg-muted-foreground transition-colors duration-200 group-hover:bg-primary data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full" />
					<div className="h-full w-px shrink-0 rounded-xs bg-muted-foreground transition-colors duration-200 group-hover:bg-primary data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full" />
				</div>
			</div>

			{isDragging &&
				ReactDOM.createPortal(
					<div
						className="fixed inset-0 z-[9999] cursor-col-resize touch-none select-none bg-transparent"
						onPointerUp={() => {
							setIsDragging(false)
						}}
						onPointerCancel={() => {
							setIsDragging(false)
						}}
						data-testid="set-is-dragging"
					/>,
					document.body,
				)}
		</>
	)
}

export default TopicResizeHandle
