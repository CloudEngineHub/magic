import type { Rect } from "../../../runtime/shared/ids"
import { MINIMAP_RENDER_CONFIG } from "./constants"
import {
	createMinimapTransform,
	mergeMinimapRects,
	projectMinimapRect,
	type MinimapSize,
	type MinimapTransform,
} from "./minimapGeometry"
import type { MinimapSceneItem } from "./minimapScene"

export interface MinimapTheme {
	elementFill: string
	containerFill: string
	selectedFill: string
	viewportStroke: string
}

interface DrawMinimapOptions {
	context: CanvasRenderingContext2D
	panelSize: MinimapSize
	items: readonly MinimapSceneItem[]
	selectedElementIds: ReadonlySet<string>
	contentBounds: Rect | null
	viewportRect: Rect | null
	theme: MinimapTheme
}

export interface MinimapRenderLayout {
	transform: MinimapTransform
	projectedViewportRect: Rect | null
}

function fillProjectedRect(
	context: CanvasRenderingContext2D,
	item: MinimapSceneItem,
	transform: NonNullable<ReturnType<typeof createMinimapTransform>>,
): void {
	const rect = projectMinimapRect(
		item.bounds,
		transform,
		MINIMAP_RENDER_CONFIG.minimumElementSize,
	)
	context.fillRect(rect.x, rect.y, rect.width, rect.height)
}

export function drawMinimap(options: DrawMinimapOptions): MinimapRenderLayout | null {
	const { context, panelSize, items, selectedElementIds, contentBounds, viewportRect, theme } =
		options
	context.clearRect(0, 0, panelSize.width, panelSize.height)

	const worldBounds = mergeMinimapRects([
		...(contentBounds ? [contentBounds] : []),
		...(viewportRect ? [viewportRect] : []),
	])
	if (!worldBounds) return null

	const transform = createMinimapTransform(worldBounds, panelSize, MINIMAP_RENDER_CONFIG.padding)
	if (!transform) return null
	const projectedViewportRect = viewportRect ? projectMinimapRect(viewportRect, transform) : null

	context.save()
	context.fillStyle = theme.containerFill
	context.globalAlpha = MINIMAP_RENDER_CONFIG.containerOpacity
	for (const item of items) {
		if (item.kind === "container" && !selectedElementIds.has(item.id)) {
			fillProjectedRect(context, item, transform)
		}
	}
	context.fillStyle = theme.selectedFill
	for (const item of items) {
		if (item.kind === "container" && selectedElementIds.has(item.id)) {
			fillProjectedRect(context, item, transform)
		}
	}

	context.fillStyle = theme.elementFill
	context.globalAlpha = 1
	for (const item of items) {
		if (item.kind === "element" && !selectedElementIds.has(item.id)) {
			fillProjectedRect(context, item, transform)
		}
	}
	context.fillStyle = theme.selectedFill
	for (const item of items) {
		if (item.kind === "element" && selectedElementIds.has(item.id)) {
			fillProjectedRect(context, item, transform)
		}
	}

	if (projectedViewportRect) {
		context.strokeStyle = theme.viewportStroke
		context.globalAlpha = MINIMAP_RENDER_CONFIG.viewportOpacity
		context.lineWidth = MINIMAP_RENDER_CONFIG.viewportLineWidth
		context.strokeRect(
			projectedViewportRect.x,
			projectedViewportRect.y,
			projectedViewportRect.width,
			projectedViewportRect.height,
		)
	}
	context.restore()

	return { transform, projectedViewportRect }
}
