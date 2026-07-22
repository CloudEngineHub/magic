import Konva from "konva"
import type { Rect } from "../../shared/ids"

export type ConnectionHandleSide = "left" | "right"
export type ConnectionHandleInteractionState = "idle" | "hover" | "active"
export type ConnectionHandleHitRegion = Rect & { side: ConnectionHandleSide }

interface ConnectionHandleCanvasMetrics {
	radius: number
	offset: number
	strokeWidth: number
	plusHalfSize: number
}

export class ConnectionHandleRenderer {
	public static readonly OVERLAY_GROUP_NAME = "connection-handle-overlay"
	public static readonly EXITING_OVERLAY_GROUP_NAME = "connection-handle-overlay-exiting"
	public static readonly HANDLE_GROUP_NAME = "connection-drag-handle"
	public static readonly HANDLE_CORRIDOR_NAME = "connection-drag-handle-corridor"
	public static readonly HANDLE_CIRCLE_NAME = "connection-drag-handle-circle"
	public static readonly HANDLE_PLUS_HORIZONTAL_NAME = "connection-drag-handle-plus-horizontal"
	public static readonly HANDLE_PLUS_VERTICAL_NAME = "connection-drag-handle-plus-vertical"

	private static readonly HANDLE_RADIUS_PX = 9
	private static readonly HANDLE_OFFSET_PX = 20
	private static readonly HANDLE_STROKE = "#5a5a5a"
	private static readonly HANDLE_FILL = "#FFFFFF"
	private static readonly HANDLE_STROKE_WIDTH_PX = 1.25
	private static readonly HANDLE_PLUS_SIZE_PX = 7
	private static readonly HANDLE_HOVER_FILL = "#F7F7F7"
	private static readonly HANDLE_ACTIVE_FILL = "#EDEDED"
	private static readonly HANDLE_INTERACTION_STROKE = "#0A0A0A"
	private static readonly HANDLE_HOVER_SHADOW_OPACITY = 0.12
	private static readonly HANDLE_ACTIVE_SHADOW_OPACITY = 0.18

	public createOverlay(elementId: string, rect: Rect, stageScale: number): Konva.Group {
		const group = new Konva.Group({
			name: ConnectionHandleRenderer.OVERLAY_GROUP_NAME,
			listening: true,
		})
		group.add(
			this.createCorridorNode("left"),
			this.createCorridorNode("right"),
			this.createHandleNode("left"),
			this.createHandleNode("right"),
		)
		this.updateOverlay(group, elementId, rect, stageScale)
		return group
	}

	public setHandleInteractionState(
		handle: Konva.Group,
		state: ConnectionHandleInteractionState,
	): void {
		handle.setAttr("connectionHandleInteractionState", state)
		const style = this.resolveHandleInteractionStyle(state)

		const circle = handle.findOne(`.${ConnectionHandleRenderer.HANDLE_CIRCLE_NAME}`)
		if (circle instanceof Konva.Circle) {
			const radius = circle.radius()
			circle.setAttrs({
				fill: style.fill,
				stroke: style.stroke,
				shadowColor: "rgba(0, 0, 0, 0.22)",
				shadowBlur: style.shadowOpacity > 0 ? radius * 0.25 : 0,
				shadowOffsetX: 0,
				shadowOffsetY: style.shadowOpacity > 0 ? radius * 0.08 : 0,
				shadowOpacity: style.shadowOpacity,
			})
		}

		const plusNodes = [
			handle.findOne(`.${ConnectionHandleRenderer.HANDLE_PLUS_HORIZONTAL_NAME}`),
			handle.findOne(`.${ConnectionHandleRenderer.HANDLE_PLUS_VERTICAL_NAME}`),
		]
		plusNodes.forEach((node) => {
			if (node instanceof Konva.Line) {
				node.stroke(style.stroke)
			}
		})
	}

	public updateOverlay(
		group: Konva.Group,
		elementId: string,
		rect: Rect,
		stageScale: number,
	): void {
		const metrics = this.resolveScreenSpaceHandleMetrics(stageScale)
		const centerY = rect.y + rect.height / 2
		const leftHitRegion = this.getHandleHitRegion(rect, stageScale, "left")
		const rightHitRegion = this.getHandleHitRegion(rect, stageScale, "right")

		this.updateCorridorNode(group, {
			elementId,
			...leftHitRegion,
		})
		this.updateCorridorNode(group, {
			elementId,
			...rightHitRegion,
		})
		this.updateHandleNode(group, {
			elementId,
			side: "left",
			x: rect.x - metrics.offset,
			y: centerY,
			radius: metrics.radius,
			strokeWidth: metrics.strokeWidth,
			plusHalfSize: metrics.plusHalfSize,
		})
		this.updateHandleNode(group, {
			elementId,
			side: "right",
			x: rect.x + rect.width + metrics.offset,
			y: centerY,
			radius: metrics.radius,
			strokeWidth: metrics.strokeWidth,
			plusHalfSize: metrics.plusHalfSize,
		})
	}

	public getHandleHitRegions(rect: Rect, stageScale: number): ConnectionHandleHitRegion[] {
		return [
			this.getHandleHitRegion(rect, stageScale, "left"),
			this.getHandleHitRegion(rect, stageScale, "right"),
		]
	}

	public isPointInHandleHitRegion(
		rect: Rect,
		stageScale: number,
		point: { x: number; y: number },
	): boolean {
		return this.getHandleHitRegions(rect, stageScale).some((region) =>
			this.isPointInRect(point, region),
		)
	}

	private createCorridorNode(side: ConnectionHandleSide): Konva.Rect {
		const corridor = new Konva.Rect({
			name: ConnectionHandleRenderer.HANDLE_CORRIDOR_NAME,
			fill: "rgba(0, 0, 0, 0)",
			listening: true,
		})
		corridor.setAttr("connectionHandleSide", side)
		corridor.on("mousedown touchstart click tap", (event) => {
			event.cancelBubble = true
			event.evt?.stopPropagation()
		})
		return corridor
	}

	private createHandleNode(side: ConnectionHandleSide): Konva.Group {
		const group = new Konva.Group({
			name: ConnectionHandleRenderer.HANDLE_GROUP_NAME,
			listening: true,
		})
		group.setAttr("connectionHandleSide", side)
		group.add(
			new Konva.Circle({
				name: ConnectionHandleRenderer.HANDLE_CIRCLE_NAME,
				listening: true,
			}),
			new Konva.Line({
				name: ConnectionHandleRenderer.HANDLE_PLUS_HORIZONTAL_NAME,
				listening: false,
			}),
			new Konva.Line({
				name: ConnectionHandleRenderer.HANDLE_PLUS_VERTICAL_NAME,
				listening: false,
			}),
		)
		return group
	}

	private updateCorridorNode(
		root: Konva.Group,
		options: {
			elementId: string
			side: ConnectionHandleSide
			x: number
			y: number
			width: number
			height: number
		},
	): void {
		const corridor = root
			.find(`.${ConnectionHandleRenderer.HANDLE_CORRIDOR_NAME}`)
			.find((node) => node.getAttr("connectionHandleSide") === options.side)
		if (!(corridor instanceof Konva.Rect)) return

		corridor.id(options.elementId)
		corridor.setAttrs({
			x: options.x,
			y: options.y,
			width: options.width,
			height: options.height,
			fill: "rgba(0, 0, 0, 0)",
			listening: true,
		})
		corridor.setAttr("elementId", options.elementId)
		corridor.setAttr("connectionHandleSide", options.side)
	}

	private updateHandleNode(
		root: Konva.Group,
		options: {
			elementId: string
			side: ConnectionHandleSide
			x: number
			y: number
			radius: number
			strokeWidth: number
			plusHalfSize: number
		},
	): void {
		const handle = root
			.find(`.${ConnectionHandleRenderer.HANDLE_GROUP_NAME}`)
			.find((node) => node.getAttr("connectionHandleSide") === options.side)
		if (!(handle instanceof Konva.Group)) return
		const interactionState = this.getHandleInteractionState(handle)

		handle.id(options.elementId)
		handle.position({ x: options.x, y: options.y })
		handle.setAttr("elementId", options.elementId)
		handle.setAttr("connectionHandleSide", options.side)

		const circle = handle.findOne(`.${ConnectionHandleRenderer.HANDLE_CIRCLE_NAME}`)
		if (circle instanceof Konva.Circle) {
			circle.setAttrs({
				x: 0,
				y: 0,
				radius: options.radius,
				fill: ConnectionHandleRenderer.HANDLE_FILL,
				stroke: ConnectionHandleRenderer.HANDLE_STROKE,
				strokeWidth: options.strokeWidth,
				shadowOpacity: 0,
				shadowBlur: 0,
				shadowOffsetX: 0,
				shadowOffsetY: 0,
				listening: true,
			})
		}

		const horizontal = handle.findOne(
			`.${ConnectionHandleRenderer.HANDLE_PLUS_HORIZONTAL_NAME}`,
		)
		if (horizontal instanceof Konva.Line) {
			horizontal.setAttrs({
				points: [-options.plusHalfSize, 0, options.plusHalfSize, 0],
				stroke: ConnectionHandleRenderer.HANDLE_STROKE,
				strokeWidth: options.strokeWidth,
				lineCap: "round",
				listening: false,
			})
		}

		const vertical = handle.findOne(`.${ConnectionHandleRenderer.HANDLE_PLUS_VERTICAL_NAME}`)
		if (vertical instanceof Konva.Line) {
			vertical.setAttrs({
				points: [0, -options.plusHalfSize, 0, options.plusHalfSize],
				stroke: ConnectionHandleRenderer.HANDLE_STROKE,
				strokeWidth: options.strokeWidth,
				lineCap: "round",
				listening: false,
			})
		}

		this.setHandleInteractionState(handle, interactionState)
	}

	private getHandleInteractionState(handle: Konva.Group): ConnectionHandleInteractionState {
		const state = handle.getAttr("connectionHandleInteractionState")
		return state === "hover" || state === "active" ? state : "idle"
	}

	private resolveHandleInteractionStyle(state: ConnectionHandleInteractionState): {
		fill: string
		stroke: string
		shadowOpacity: number
	} {
		if (state === "active") {
			return {
				fill: ConnectionHandleRenderer.HANDLE_ACTIVE_FILL,
				stroke: ConnectionHandleRenderer.HANDLE_INTERACTION_STROKE,
				shadowOpacity: ConnectionHandleRenderer.HANDLE_ACTIVE_SHADOW_OPACITY,
			}
		}
		if (state === "hover") {
			return {
				fill: ConnectionHandleRenderer.HANDLE_HOVER_FILL,
				stroke: ConnectionHandleRenderer.HANDLE_INTERACTION_STROKE,
				shadowOpacity: ConnectionHandleRenderer.HANDLE_HOVER_SHADOW_OPACITY,
			}
		}
		return {
			fill: ConnectionHandleRenderer.HANDLE_FILL,
			stroke: ConnectionHandleRenderer.HANDLE_STROKE,
			shadowOpacity: 0,
		}
	}

	private getSafeStageScale(scale: number): number {
		return Number.isFinite(scale) && scale > 0 ? scale : 1
	}

	private getHandleHitRegion(
		rect: Rect,
		stageScale: number,
		side: ConnectionHandleSide,
	): ConnectionHandleHitRegion {
		const metrics = this.resolveScreenSpaceHandleMetrics(stageScale)
		if (side === "left") {
			return {
				side,
				x: rect.x - metrics.offset - metrics.radius,
				y: rect.y,
				width: metrics.offset + metrics.radius,
				height: rect.height,
			}
		}
		return {
			side,
			x: rect.x + rect.width,
			y: rect.y,
			width: metrics.offset + metrics.radius,
			height: rect.height,
		}
	}

	private isPointInRect(point: { x: number; y: number }, rect: Rect): boolean {
		return (
			point.x >= rect.x &&
			point.x <= rect.x + rect.width &&
			point.y >= rect.y &&
			point.y <= rect.y + rect.height
		)
	}

	private resolveScreenSpaceHandleMetrics(stageScale: number): ConnectionHandleCanvasMetrics {
		const scale = this.getSafeStageScale(stageScale)

		// Handles live in controlsLayer, outside element groups, so only viewport scale is inverted.
		return {
			radius: ConnectionHandleRenderer.HANDLE_RADIUS_PX / scale,
			offset: ConnectionHandleRenderer.HANDLE_OFFSET_PX / scale,
			strokeWidth: ConnectionHandleRenderer.HANDLE_STROKE_WIDTH_PX / scale,
			plusHalfSize: ConnectionHandleRenderer.HANDLE_PLUS_SIZE_PX / 2 / scale,
		}
	}
}
