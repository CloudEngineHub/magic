import Konva from "konva"
import type { Canvas } from "../../core/Canvas"
import type { Rect } from "../../shared/ids"
import type { ConnectionHandleSide } from "./ConnectionHandleRenderer"
import { resolveConnectionControlOffset, resolveConnectionGeometry } from "./connectionGeometry"
import {
	CONNECTION_DRAG_INVALID_PREVIEW_STYLE,
	CONNECTION_DRAG_INVALID_TARGET_STYLE,
	CONNECTION_DRAG_PREVIEW_STYLE,
	CONNECTION_DRAG_VALID_PREVIEW_STYLE,
	CONNECTION_DRAG_VALID_TARGET_STYLE,
	resolveConnectionCanvasStrokeWidth,
} from "./connectionStyle"

interface ConnectionDragPoint {
	x: number
	y: number
}

interface ConnectionDragPreviewLineStyle {
	stroke: string
	strokeWidth: number
	opacity: number
	shadowColor: string
	shadowBlur: number
	shadowOpacity: number
	dash: readonly number[]
}

export interface ConnectionDragPreviewOptions {
	originRect: Rect
	originSide: ConnectionHandleSide
	pointerCanvasPoint: ConnectionDragPoint
	state?: ConnectionDragPreviewState
	sourceRect?: Rect | null
	targetRect?: Rect | null
	targetFeedbackRect?: Rect | null
	targetElementId?: string | null
	validationReason?: ConnectionDragPreviewValidationReason | null
}

const PREVIEW_GROUP_NAME = "connection-drag-preview"
const PREVIEW_PATH_NAME = "connection-drag-preview-path"
const TARGET_FEEDBACK_RECT_NAME = "connection-drag-target-feedback"

export type ConnectionDragPreviewState = "free" | "valid" | "invalid"

export type ConnectionDragPreviewValidationReason =
	| "self"
	| "missing-element"
	| "invisible"
	| "cannot-connect"
	| "transforming"
	| "already-connected"
	| "reverse-existing"

function getEdgePoint(rect: Rect, side: ConnectionHandleSide): ConnectionDragPoint {
	return {
		x: side === "right" ? rect.x + rect.width : rect.x,
		y: rect.y + rect.height / 2,
	}
}

function resolveFreePreviewPathData(
	originRect: Rect,
	originSide: ConnectionHandleSide,
	pointerCanvasPoint: ConnectionDragPoint,
): string {
	const start = getEdgePoint(originRect, originSide)
	const end = pointerCanvasPoint
	const horizontalDistance = Math.abs(end.x - start.x)
	const controlOffset = resolveConnectionControlOffset(horizontalDistance)
	const direction = originSide === "right" ? 1 : -1
	const controlPoint1 = {
		x: start.x + controlOffset * direction,
		y: start.y,
	}
	const controlPoint2 = {
		x: end.x - controlOffset * direction,
		y: end.y,
	}

	return `M ${start.x} ${start.y} C ${controlPoint1.x} ${controlPoint1.y} ${controlPoint2.x} ${controlPoint2.y} ${end.x} ${end.y}`
}

export class ConnectionDragRenderer {
	public static readonly PREVIEW_GROUP_NAME = PREVIEW_GROUP_NAME
	public static readonly PREVIEW_PATH_NAME = PREVIEW_PATH_NAME
	public static readonly TARGET_FEEDBACK_RECT_NAME = TARGET_FEEDBACK_RECT_NAME

	private readonly canvas: Canvas
	private previewGroup: Konva.Group | null = null

	constructor(options: { canvas: Canvas }) {
		this.canvas = options.canvas
	}

	public render(options: ConnectionDragPreviewOptions): void {
		const previewGroup = this.ensurePreviewGroup()
		previewGroup.destroyChildren()

		const previewState = options.state ?? "free"
		const targetGeometry =
			previewState === "valid" && options.sourceRect && options.targetRect
				? resolveConnectionGeometry(options.sourceRect, options.targetRect)
				: null
		const pathData =
			targetGeometry?.pathData ??
			resolveFreePreviewPathData(
				options.originRect,
				options.originSide,
				options.pointerCanvasPoint,
			)
		const scale = this.getSafeStageScale()
		const previewStyle = this.getPreviewStyle(previewState)
		const path = new Konva.Path({
			name: PREVIEW_PATH_NAME,
			data: pathData,
			stroke: previewStyle.stroke,
			strokeWidth: resolveConnectionCanvasStrokeWidth(previewStyle.strokeWidth, scale),
			opacity: previewStyle.opacity,
			lineCap: "round",
			lineJoin: "round",
			shadowColor: previewStyle.shadowColor,
			shadowBlur: previewStyle.shadowBlur / scale,
			shadowOpacity: previewStyle.shadowOpacity,
			dash: previewStyle.dash.map((value) => value / scale),
			listening: false,
		})
		path.setAttr("connectionDragPreviewData", {
			targetElementId: options.targetElementId ?? null,
			originSide: options.originSide,
			state: previewState,
			validationReason: options.validationReason ?? null,
			sourceSide: targetGeometry?.sourceSide ?? null,
			targetSide: targetGeometry?.targetSide ?? null,
		})
		previewGroup.add(path)
		this.addTargetFeedbackRect(previewGroup, options, previewState, scale)
		this.requestDraw("render")
	}

	public clear(): void {
		if (!this.previewGroup) return
		this.previewGroup.destroy()
		this.previewGroup = null
		this.requestDraw("clear")
	}

	public destroy(): void {
		this.clear()
	}

	private ensurePreviewGroup(): Konva.Group {
		if (!this.previewGroup || this.previewGroup.getParent() !== this.canvas.controlsLayer) {
			this.previewGroup = new Konva.Group({
				name: PREVIEW_GROUP_NAME,
				listening: false,
			})
			this.canvas.controlsLayer.add(this.previewGroup)
		}
		this.previewGroup.moveToTop()
		return this.previewGroup
	}

	private getSafeStageScale(): number {
		const scale = this.canvas.stage.scaleX()
		return Number.isFinite(scale) && scale > 0 ? scale : 1
	}

	private addTargetFeedbackRect(
		previewGroup: Konva.Group,
		options: ConnectionDragPreviewOptions,
		previewState: ConnectionDragPreviewState,
		scale: number,
	): void {
		if (previewState === "free" || !options.targetFeedbackRect) return

		const targetStyle =
			previewState === "valid"
				? CONNECTION_DRAG_VALID_TARGET_STYLE
				: CONNECTION_DRAG_INVALID_TARGET_STYLE
		const rect = new Konva.Rect({
			name: TARGET_FEEDBACK_RECT_NAME,
			x: options.targetFeedbackRect.x,
			y: options.targetFeedbackRect.y,
			width: options.targetFeedbackRect.width,
			height: options.targetFeedbackRect.height,
			cornerRadius: targetStyle.cornerRadius / scale,
			stroke: targetStyle.stroke,
			strokeWidth: targetStyle.strokeWidth / scale,
			dash: targetStyle.dash.map((value) => value / scale),
			fill: "rgba(0, 0, 0, 0)",
			listening: false,
		})
		rect.setAttr("connectionDragTargetFeedbackData", {
			targetElementId: options.targetElementId ?? null,
			state: previewState,
			validationReason: options.validationReason ?? null,
		})
		previewGroup.add(rect)
	}

	private getPreviewStyle(state: ConnectionDragPreviewState): ConnectionDragPreviewLineStyle {
		if (state === "valid") return CONNECTION_DRAG_VALID_PREVIEW_STYLE
		if (state === "invalid") return CONNECTION_DRAG_INVALID_PREVIEW_STYLE
		return CONNECTION_DRAG_PREVIEW_STYLE
	}

	private requestDraw(reason: string): void {
		this.canvas.runtimeScheduler.requestLayerDraw("controls", {
			source: "ConnectionDragRenderer",
			reason,
			priority: "input",
		})
	}
}
