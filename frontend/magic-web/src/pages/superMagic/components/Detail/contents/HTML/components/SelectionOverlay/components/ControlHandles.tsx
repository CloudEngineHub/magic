import { RotateCw, Move } from "lucide-react"
// 恢复复制、删除按钮时，同时启用以下图标：Copy、Trash2。
// import { Copy, Trash2 } from "lucide-react"
import type { ResizeHandleConfig, ElementRect } from "../types"
import { RotationIndicator } from "./RotationIndicator"

interface ControlHandlesProps {
	// Move
	isMoving: boolean
	onMoveHandleMouseDown: (event: React.PointerEvent) => void
	// Duplicate
	onDuplicate: (event: React.PointerEvent) => void
	// Delete
	onDelete: (event: React.PointerEvent) => void
	// Resize
	resizeHandles: ResizeHandleConfig[]
	onResizeHandleMouseDown: (event: React.PointerEvent, handle: ResizeHandleConfig) => void
	// Rotate
	rotation: number
	onRotateHandleMouseDown: (
		event: React.PointerEvent,
		rect: ElementRect,
		containerElement: HTMLElement | null,
	) => void
	transformedRect: ElementRect
	containerElement: HTMLElement | null
	// Size-based display control
	showActionHandles?: boolean
}

/**
 * Control handles for selected element (move, rotate, resize, delete, duplicate)
 */
export function ControlHandles({
	isMoving,
	onMoveHandleMouseDown,
	resizeHandles,
	onResizeHandleMouseDown,
	rotation,
	onRotateHandleMouseDown,
	transformedRect,
	containerElement,
}: ControlHandlesProps) {
	return (
		<>
			{/* Move handle - top left corner */}
			<div
				role="button"
				aria-label="Move element"
				className="pointer-events-auto absolute flex h-6 w-6 touch-none items-center justify-center rounded-full border-2 border-background bg-primary shadow-md transition-transform duration-150 ease-out hover:scale-105 active:scale-[0.96] motion-reduce:transition-none"
				style={{
					top: -14,
					left: -14,
					cursor: isMoving ? "grabbing" : "grab",
				}}
				onPointerDown={onMoveHandleMouseDown}
				data-testid="on-move-handle-mouse-down"
			>
				<Move size={12} className="text-primary-foreground" />
			</div>

			{/* 暂时隐藏复制和删除按钮，保留对应回调与快捷键逻辑。 */}
			{/*
			{showActionHandles && (
				<div
					role="button"
					aria-label="Duplicate element"
					className="pointer-events-auto absolute flex h-6 w-6 touch-none items-center justify-center rounded-full border-2 border-background bg-blue-500 shadow-md transition-transform duration-150 ease-out hover:scale-105 active:scale-[0.96] motion-reduce:transition-none"
					style={{
						top: -14,
						right: 20,
						cursor: "pointer",
					}}
					onPointerDown={onDuplicate}
					data-testid="on-duplicate"
				>
					<Copy size={12} className="text-white" />
				</div>
			)}

			{showActionHandles && (
				<div
					role="button"
					aria-label="Delete element"
					className="pointer-events-auto absolute flex h-6 w-6 touch-none items-center justify-center rounded-full border-2 border-background bg-destructive shadow-md transition-transform duration-150 ease-out hover:scale-105 active:scale-[0.96] motion-reduce:transition-none"
					style={{
						top: -14,
						right: -14,
						cursor: "pointer",
					}}
					onPointerDown={onDelete}
					data-testid="on-delete"
				>
					<Trash2 size={12} className="text-destructive-foreground" />
				</div>
			)}
			*/}

			{/* Resize handles */}
			{resizeHandles.map((handle) => (
				<div
					key={handle.id}
					role="button"
					aria-label={`Resize ${handle.id}`}
					className="pointer-events-auto absolute h-3 w-3 touch-none rounded-full border-2 border-primary bg-background shadow-sm"
					style={{
						...handle.style,
						cursor: handle.cursor,
					}}
					onPointerDown={(event) => onResizeHandleMouseDown(event, handle)}
					data-testid="on-resize-handle-mouse-down"
				/>
			))}

			{/* Rotate handle */}
			<div
				className="pointer-events-none absolute left-1/2 -translate-x-1/2"
				style={{
					top: -32,
				}}
			>
				{/* Connection line */}
				<div
					className="absolute left-1/2 top-6 h-6 w-0.5 -translate-x-1/2 bg-primary"
					style={{
						opacity: 0.5,
					}}
				/>
				{/* Rotate handle button */}
				<div
					role="button"
					aria-label="Rotate element"
					className="pointer-events-auto flex h-6 w-6 touch-none items-center justify-center rounded-full border-2 border-background bg-primary shadow-md transition-transform duration-150 ease-out hover:scale-105 active:scale-[0.96] motion-reduce:transition-none"
					style={{
						cursor: "grab",
					}}
					onPointerDown={(event) =>
						onRotateHandleMouseDown(event, transformedRect, containerElement)
					}
					data-testid="on-rotate-handle-mouse-down"
				>
					<RotateCw size={12} className="text-primary-foreground" />
				</div>
				{/* Rotation angle indicator */}
				<RotationIndicator rotation={rotation} />
			</div>
		</>
	)
}
