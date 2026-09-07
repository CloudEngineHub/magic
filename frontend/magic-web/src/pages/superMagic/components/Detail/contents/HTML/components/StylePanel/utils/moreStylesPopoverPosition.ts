import { getContextViewport } from "../../ElementContextPanel/contextPanelPosition"
import type { ElementRect } from "../../SelectionOverlay/types"

export const MORE_STYLES_PANEL_WIDTH_REM = 22
export const MORE_STYLES_PANEL_HEIGHT_REM = 30

export type MoreStylesPopoverSide = "top" | "bottom" | "left" | "right"
export type MoreStylesPopoverAlign = "start" | "end"

export interface MoreStylesPopoverPlacement {
	side: MoreStylesPopoverSide
	align: MoreStylesPopoverAlign
	maxHeight: number
}

interface PanelBox {
	left: number
	top: number
	width: number
	height: number
}

interface PlacementCandidate extends MoreStylesPopoverPlacement {
	area: number
	overlapArea: number
	priority: number
}

const SIDES: MoreStylesPopoverSide[] = ["top", "bottom", "left", "right"]
const ALIGNS: MoreStylesPopoverAlign[] = ["start", "end"]
const MIN_RENDERABLE_HEIGHT = 48

export function getRootFontSize(): number {
	if (typeof document === "undefined") return 16
	return Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

export function getMoreStylesPanelSize(
	viewport: { width: number; height: number },
	rem = getRootFontSize(),
) {
	return {
		width: Math.min(MORE_STYLES_PANEL_WIDTH_REM * rem, Math.max(1, viewport.width - rem)),
		height: Math.min(MORE_STYLES_PANEL_HEIGHT_REM * rem, Math.max(1, viewport.height - rem)),
	}
}

export function getMoreStylesPopoverPlacement(
	trigger: ElementRect,
	selection: ElementRect,
	viewport: { left?: number; top?: number; width: number; height: number },
	panel: { width: number; height: number },
	gap = 8,
): MoreStylesPopoverPlacement {
	const viewportLeft = viewport.left ?? 0
	const viewportTop = viewport.top ?? 0
	const bounds = {
		left: viewportLeft + 8,
		top: viewportTop + 8,
		right: viewportLeft + viewport.width - 8,
		bottom: viewportTop + viewport.height - 8,
	}
	const preferredSides = getPreferredSides(trigger, selection)
	const candidates = SIDES.flatMap((side) =>
		ALIGNS.map((align) =>
			createCandidate(side, align, trigger, selection, panel, bounds, gap, preferredSides),
		),
	)
	const noOverlap = candidates.filter(
		(item) => item.overlapArea === 0 && item.maxHeight >= MIN_RENDERABLE_HEIGHT,
	)
	const chosen =
		pickCandidate(noOverlap) ||
		pickCandidate(candidates.filter((item) => item.maxHeight >= MIN_RENDERABLE_HEIGHT)) ||
		pickCandidate(candidates)

	return {
		side: chosen.side,
		align: chosen.align,
		maxHeight: chosen.maxHeight,
	}
}

export function getMoreStylesViewport(
	boundary?: { left: number; top: number; right?: number; width: number; height: number } | null,
) {
	return getContextViewport(boundary)
}

function getPreferredSides(trigger: ElementRect, selection: ElementRect): MoreStylesPopoverSide[] {
	const triggerCenterX = trigger.left + trigger.width / 2
	const triggerCenterY = trigger.top + trigger.height / 2
	const selectionCenterX = selection.left + selection.width / 2
	const selectionCenterY = selection.top + selection.height / 2
	const deltaX = selectionCenterX - triggerCenterX
	const deltaY = selectionCenterY - triggerCenterY
	if (Math.abs(deltaY) >= Math.abs(deltaX)) {
		return deltaY >= 0 ? ["top", "left", "right", "bottom"] : ["bottom", "left", "right", "top"]
	}
	return deltaX >= 0 ? ["left", "top", "bottom", "right"] : ["right", "top", "bottom", "left"]
}

function createCandidate(
	side: MoreStylesPopoverSide,
	align: MoreStylesPopoverAlign,
	trigger: ElementRect,
	selection: ElementRect,
	panel: { width: number; height: number },
	bounds: { left: number; top: number; right: number; bottom: number },
	gap: number,
	preferredSides: MoreStylesPopoverSide[],
): PlacementCandidate {
	const space = getAvailableSpace(side, trigger, bounds, gap)
	const width = Math.max(1, Math.min(panel.width, Math.max(1, space.width)))
	const height = Math.max(1, Math.min(panel.height, Math.max(1, space.height)))
	const box = clampBox(getAdjacentBox(side, align, trigger, width, height, gap), bounds)
	return {
		side,
		align,
		maxHeight: box.height,
		area: box.width * box.height,
		overlapArea: getOverlapArea(box, selection),
		priority: preferredSides.indexOf(side) * 2 + (align === "start" ? 0 : 1),
	}
}

function getAvailableSpace(
	side: MoreStylesPopoverSide,
	trigger: ElementRect,
	bounds: { left: number; top: number; right: number; bottom: number },
	gap: number,
) {
	const viewportWidth = Math.max(1, bounds.right - bounds.left)
	const viewportHeight = Math.max(1, bounds.bottom - bounds.top)
	if (side === "top") {
		return { width: viewportWidth, height: Math.max(0, trigger.top - bounds.top - gap) }
	}
	if (side === "bottom") {
		return {
			width: viewportWidth,
			height: Math.max(0, bounds.bottom - trigger.top - trigger.height - gap),
		}
	}
	if (side === "left") {
		return { width: Math.max(0, trigger.left - bounds.left - gap), height: viewportHeight }
	}
	return {
		width: Math.max(0, bounds.right - trigger.left - trigger.width - gap),
		height: viewportHeight,
	}
}

function getAdjacentBox(
	side: MoreStylesPopoverSide,
	align: MoreStylesPopoverAlign,
	trigger: ElementRect,
	width: number,
	height: number,
	gap: number,
): PanelBox {
	if (side === "top" || side === "bottom") {
		return {
			left: align === "end" ? trigger.left + trigger.width - width : trigger.left,
			top: side === "top" ? trigger.top - gap - height : trigger.top + trigger.height + gap,
			width,
			height,
		}
	}
	return {
		left: side === "left" ? trigger.left - gap - width : trigger.left + trigger.width + gap,
		top: align === "end" ? trigger.top + trigger.height - height : trigger.top,
		width,
		height,
	}
}

function clampBox(
	box: PanelBox,
	bounds: { left: number; top: number; right: number; bottom: number },
): PanelBox {
	const width = Math.max(1, Math.min(box.width, bounds.right - bounds.left))
	const height = Math.max(1, Math.min(box.height, bounds.bottom - bounds.top))
	return {
		left: clamp(box.left, bounds.left, bounds.right - width),
		top: clamp(box.top, bounds.top, bounds.bottom - height),
		width,
		height,
	}
}

function pickCandidate(candidates: PlacementCandidate[]): PlacementCandidate | undefined {
	return [...candidates].sort(
		(left, right) =>
			left.overlapArea - right.overlapArea ||
			right.area - left.area ||
			left.priority - right.priority,
	)[0]
}

function getOverlapArea(first: PanelBox, second: ElementRect): number {
	const width = Math.max(
		0,
		Math.min(first.left + first.width, second.left + second.width) -
			Math.max(first.left, second.left),
	)
	const height = Math.max(
		0,
		Math.min(first.top + first.height, second.top + second.height) -
			Math.max(first.top, second.top),
	)
	return width * height
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max)
}
