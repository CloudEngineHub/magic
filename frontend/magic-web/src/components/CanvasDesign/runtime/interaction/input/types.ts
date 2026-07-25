import type Konva from "konva"

export type CanvasPointerType = "mouse" | "touch" | "pen"

export type CanvasInputEventType = "down" | "move" | "up" | "cancel"

export type CanvasNativePointerEvent = MouseEvent | PointerEvent | TouchEvent

export interface CanvasInputPoint {
	x: number
	y: number
}

export interface CanvasInputModifiers {
	shift: boolean
	alt: boolean
	meta: boolean
	ctrl: boolean
}

export interface CanvasPointerInput {
	type: CanvasInputEventType
	pointerId: number
	pointerType: CanvasPointerType
	button: number
	buttons: number
	client: CanvasInputPoint
	stage: CanvasInputPoint
	canvas: CanvasInputPoint
	target: Konva.Node
	modifiers: CanvasInputModifiers
	activePointerCount: number
	nativeEvent: CanvasNativePointerEvent
	konvaEvent: Konva.KonvaEventObject<CanvasNativePointerEvent>
}

export type CanvasPointerInputHandler = (input: CanvasPointerInput) => void
