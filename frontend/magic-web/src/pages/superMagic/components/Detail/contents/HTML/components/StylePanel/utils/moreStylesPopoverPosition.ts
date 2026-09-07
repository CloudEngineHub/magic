import type { ElementRect } from "../../SelectionOverlay/types"

export const MORE_STYLES_PANEL_WIDTH_REM = 22
export const MORE_STYLES_PANEL_HEIGHT_REM = 30

export type MoreStylesPopoverSide = "right" | "top" | "bottom" | "left"

export interface MoreStylesPopoverLayout {
	left: number
	top: number
	width: number
	height: number
	maxHeight: number
	side: MoreStylesPopoverSide
}

interface LayoutCandidate extends MoreStylesPopoverLayout {
	usable: boolean
	overlapArea: number
	priority: number
}

const INSET = 8
const MIN_USABLE_HEIGHT = 160
const MIN_USABLE_WIDTH = 240

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

export function getMoreStylesViewport(
	_boundary?: { left: number; top: number; right?: number; width: number; height: number } | null,
) {
	if (typeof window === "undefined") return { left: 0, top: 0, width: 0, height: 0 }
	return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
}

/**
 * Place the More Styles panel in the window.
 * Prefer right of the trigger; the panel may leave the canvas.
 * Keep the panel inside the window, not a random corner.
 */
export function getMoreStylesPopoverLayout(
	trigger: ElementRect,
	selection: ElementRect,
	viewport: { left?: number; top?: number; width: number; height: number },
	panel: { width: number; height: number },
	gap = 8,
): MoreStylesPopoverLayout {
	const viewportLeft = viewport.left ?? 0
	const viewportTop = viewport.top ?? 0
	const bounds = {
		left: viewportLeft + INSET,
		top: viewportTop + INSET,
		right: viewportLeft + viewport.width - INSET,
		bottom: viewportTop + viewport.height - INSET,
	}
	const canvasWidth = Math.max(1, bounds.right - bounds.left)
	const canvasHeight = Math.max(1, bounds.bottom - bounds.top)

	const candidates = [
		createRightCandidate(trigger, selection, panel, bounds, canvasWidth, canvasHeight, gap),
		createTopCandidate(trigger, selection, panel, bounds, canvasWidth, gap),
		createBottomCandidate(trigger, selection, panel, bounds, canvasWidth, gap),
		createLeftCandidate(trigger, selection, panel, bounds, canvasWidth, canvasHeight, gap),
	]

	const usableClear = candidates.filter(
		(candidate) => candidate.usable && candidate.overlapArea === 0,
	)
	if (usableClear.length > 0) {
		usableClear.sort((a, b) => a.priority - b.priority)
		return toLayout(usableClear[0])
	}

	const usable = candidates.filter((candidate) => candidate.usable)
	if (usable.length > 0) {
		usable.sort((a, b) => a.priority - b.priority)
		return toLayout(usable[0])
	}

	candidates.sort((a, b) => b.width * b.height - a.width * a.height || a.priority - b.priority)
	return toLayout(candidates[0])
}

function createRightCandidate(
	trigger: ElementRect,
	selection: ElementRect,
	panel: { width: number; height: number },
	bounds: Bounds,
	canvasWidth: number,
	canvasHeight: number,
	gap: number,
): LayoutCandidate {
	const left = trigger.left + trigger.width + gap
	const availableWidth = bounds.right - left
	const box = clampBox(
		left,
		trigger.top,
		Math.min(panel.width, Math.max(1, availableWidth)),
		Math.min(panel.height, canvasHeight),
		bounds,
		canvasWidth,
		canvasHeight,
	)
	return {
		...box,
		maxHeight: box.height,
		side: "right",
		usable: availableWidth >= MIN_USABLE_WIDTH && box.height >= MIN_USABLE_HEIGHT,
		overlapArea: getOverlapArea(box, selection),
		priority: 0,
	}
}

function createTopCandidate(
	trigger: ElementRect,
	selection: ElementRect,
	panel: { width: number; height: number },
	bounds: Bounds,
	canvasWidth: number,
	gap: number,
): LayoutCandidate {
	const pocketBottom = Math.min(trigger.top, selection.top) - gap
	const availableHeight = pocketBottom - bounds.top
	const height = Math.min(panel.height, Math.max(1, availableHeight))
	const width = Math.min(panel.width, canvasWidth)
	const box = clampBox(
		trigger.left + trigger.width - width,
		pocketBottom - height,
		width,
		height,
		bounds,
		canvasWidth,
		Math.max(1, availableHeight),
	)
	return {
		...box,
		maxHeight: box.height,
		side: "top",
		usable: availableHeight >= MIN_USABLE_HEIGHT && box.height >= MIN_USABLE_HEIGHT,
		overlapArea: getOverlapArea(box, selection),
		priority: 1,
	}
}

function createBottomCandidate(
	trigger: ElementRect,
	selection: ElementRect,
	panel: { width: number; height: number },
	bounds: Bounds,
	canvasWidth: number,
	gap: number,
): LayoutCandidate {
	const top = trigger.top + trigger.height + gap
	const availableHeight = bounds.bottom - top
	const width = Math.min(panel.width, canvasWidth)
	const box = clampBox(
		trigger.left + trigger.width - width,
		top,
		width,
		Math.min(panel.height, Math.max(1, availableHeight)),
		bounds,
		canvasWidth,
		Math.max(1, availableHeight),
	)
	return {
		...box,
		maxHeight: box.height,
		side: "bottom",
		usable: availableHeight >= MIN_USABLE_HEIGHT && box.height >= MIN_USABLE_HEIGHT,
		overlapArea: getOverlapArea(box, selection),
		priority: 2,
	}
}

function createLeftCandidate(
	trigger: ElementRect,
	selection: ElementRect,
	panel: { width: number; height: number },
	bounds: Bounds,
	canvasWidth: number,
	canvasHeight: number,
	gap: number,
): LayoutCandidate {
	const availableWidth = trigger.left - bounds.left - gap
	const width = Math.min(panel.width, Math.max(1, availableWidth))
	const box = clampBox(
		trigger.left - gap - width,
		trigger.top,
		width,
		Math.min(panel.height, canvasHeight),
		bounds,
		canvasWidth,
		canvasHeight,
	)
	return {
		...box,
		maxHeight: box.height,
		side: "left",
		usable: availableWidth >= MIN_USABLE_WIDTH && box.height >= MIN_USABLE_HEIGHT,
		overlapArea: getOverlapArea(box, selection),
		priority: 3,
	}
}

interface Bounds {
	left: number
	top: number
	right: number
	bottom: number
}

function clampBox(
	left: number,
	top: number,
	width: number,
	height: number,
	bounds: Bounds,
	canvasWidth: number,
	canvasHeight: number,
) {
	const nextWidth = Math.min(Math.max(1, width), canvasWidth)
	const nextHeight = Math.min(Math.max(1, height), canvasHeight)
	return {
		left: clamp(left, bounds.left, bounds.right - nextWidth),
		top: clamp(top, bounds.top, bounds.bottom - nextHeight),
		width: nextWidth,
		height: nextHeight,
	}
}

function toLayout(candidate: LayoutCandidate): MoreStylesPopoverLayout {
	return {
		left: candidate.left,
		top: candidate.top,
		width: candidate.width,
		height: candidate.height,
		maxHeight: candidate.maxHeight,
		side: candidate.side,
	}
}

function getOverlapArea(
	first: { left: number; top: number; width: number; height: number },
	second: ElementRect,
): number {
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
