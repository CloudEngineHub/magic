import {
	useEffect,
	useState,
	type CSSProperties,
	type PointerEvent as ReactPointerEvent,
} from "react"
import ReactDOM from "react-dom"
import { ResizeGrip } from "@/pages/superMagic/components/ResizeGrip/ResizeGrip"
import { cn } from "@/utils/cn"

interface TopicResizeHandleProps {
	className?: string
	disabled?: boolean
	gripVariant?: "default" | "dots"
	onResizeStart: (clientX: number) => void
	style?: CSSProperties
}

/** Keeps the layout divider narrow while exposing a wider pointer target for reliable resizing. */
function TopicResizeHandle({
	className,
	disabled = false,
	gripVariant = "default",
	onResizeStart,
	style,
}: TopicResizeHandleProps) {
	const [isDragging, setIsDragging] = useState(false)

	/** Starts resize from a unified pointer event so mouse, trackpad, and touch share one path. */
	const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (disabled) return
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
				data-resizing={isDragging ? "true" : undefined}
				onPointerDown={handlePointerDown}
				className={cn(
					"focus-visible:outline-hidden relative flex w-px items-center justify-center bg-border focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full [&[data-panel-group-direction=vertical]>div]:rotate-90",
					"group relative flex !w-2 cursor-col-resize touch-none items-center justify-center !bg-transparent",
					"overflow-visible before:pointer-events-none before:absolute before:inset-0 before:z-0",
					"before:bg-gradient-to-b before:from-[rgba(239,246,255,0)] before:via-[rgba(210,230,255,1)] before:to-[rgba(239,246,255,0)]",
					"before:opacity-0 before:transition-opacity before:duration-200 hover:before:opacity-100",
					"data-[panel-group-direction=vertical]:!h-2 data-[panel-group-direction=vertical]:!w-full",
					"data-[panel-group-direction=vertical]:before:bg-gradient-to-r",
					disabled && "pointer-events-none",
					disabled && "opacity-0",
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
				{gripVariant === "dots" ? (
					<ResizeGrip orientation="vertical" />
				) : (
					<div className="pointer-events-none relative z-10 flex h-5 shrink-0 items-center justify-center gap-0.5 data-[panel-group-direction=vertical]:h-auto data-[panel-group-direction=vertical]:w-5 data-[panel-group-direction=vertical]:flex-col">
						<div className="h-full w-px shrink-0 rounded-xs bg-muted-foreground transition-colors duration-200 group-hover:bg-primary data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full" />
						<div className="h-full w-px shrink-0 rounded-xs bg-muted-foreground transition-colors duration-200 group-hover:bg-primary data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full" />
					</div>
				)}
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
