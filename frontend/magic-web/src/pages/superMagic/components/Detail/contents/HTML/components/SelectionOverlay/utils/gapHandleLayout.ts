import type { ElementRect } from "../types"

export const GAP_HANDLE_MIN_HIT = 8
export type GapAxis = "row" | "column"
export type GapChildRect = ElementRect & { position?: string; display?: string }

export interface GapHandleFrame {
	axis: GapAxis
	left: number
	top: number
	width: number
	height: number
	cursor: "col-resize" | "row-resize"
}

const ROW_OVERLAP_RATIO = 0.5

export function isFlexOrGridDisplay(display: string): boolean {
	return (
		display === "flex" ||
		display === "inline-flex" ||
		display === "grid" ||
		display === "inline-grid"
	)
}

export function getInFlowChildRects(children: GapChildRect[]): ElementRect[] {
	return children.filter((child) => {
		const position = (child.position || "static").toLowerCase()
		const display = (child.display || "block").toLowerCase()
		return display !== "none" && position !== "absolute" && position !== "fixed"
	})
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
	return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))
}

function shareRow(a: ElementRect, b: ElementRect): boolean {
	const minH = Math.min(a.height, b.height)
	return (
		minH > 0 &&
		overlap(a.top, a.top + a.height, b.top, b.top + b.height) / minH >= ROW_OVERLAP_RATIO
	)
}

function shareColumn(a: ElementRect, b: ElementRect): boolean {
	const minW = Math.min(a.width, b.width)
	return (
		minW > 0 &&
		overlap(a.left, a.left + a.width, b.left, b.left + b.width) / minW >= ROW_OVERLAP_RATIO
	)
}

function hitSize(gap: number): number {
	return Math.max(GAP_HANDLE_MIN_HIT, gap)
}

export function getGapHandleLayout(
	containerRect: ElementRect,
	childRects: GapChildRect[],
	display: string,
): GapHandleFrame[] {
	if (!isFlexOrGridDisplay(display)) return []
	const children = getInFlowChildRects(childRects)
	if (children.length < 2) return []

	const frames: GapHandleFrame[] = []
	const byLeft = [...children].sort((a, b) => a.left - b.left || a.top - b.top)
	let columnPair: [ElementRect, ElementRect] | null = null
	for (let i = 0; i < byLeft.length && !columnPair; i++) {
		for (let j = i + 1; j < byLeft.length; j++) {
			const leftChild = byLeft[i]
			const rightChild = byLeft[j]
			if (
				shareRow(leftChild, rightChild) &&
				rightChild.left >= leftChild.left + leftChild.width - 0.5
			) {
				columnPair = [leftChild, rightChild]
				break
			}
		}
	}
	if (columnPair) {
		const [leftChild, rightChild] = columnPair
		const gap = Math.max(0, rightChild.left - (leftChild.left + leftChild.width))
		const width = hitSize(gap)
		const centerX = leftChild.left + leftChild.width + gap / 2
		const top = Math.max(leftChild.top, rightChild.top)
		const bottom = Math.min(
			leftChild.top + leftChild.height,
			rightChild.top + rightChild.height,
		)
		frames.push({
			axis: "column",
			left: centerX - containerRect.left - width / 2,
			top: top - containerRect.top,
			width,
			height: Math.max(GAP_HANDLE_MIN_HIT, bottom - top),
			cursor: "col-resize",
		})
	}

	const byTop = [...children].sort((a, b) => a.top - b.top || a.left - b.left)
	let rowPair: [ElementRect, ElementRect] | null = null
	for (let i = 0; i < byTop.length && !rowPair; i++) {
		for (let j = i + 1; j < byTop.length; j++) {
			const above = byTop[i]
			const below = byTop[j]
			if (shareColumn(above, below) && below.top >= above.top + above.height - 0.5) {
				rowPair = [above, below]
				break
			}
		}
	}
	if (rowPair) {
		const [above, below] = rowPair
		const gap = Math.max(0, below.top - (above.top + above.height))
		const height = hitSize(gap)
		const centerY = above.top + above.height + gap / 2
		const left = Math.max(above.left, below.left)
		const right = Math.min(above.left + above.width, below.left + below.width)
		frames.push({
			axis: "row",
			left: left - containerRect.left,
			top: centerY - containerRect.top - height / 2,
			width: Math.max(GAP_HANDLE_MIN_HIT, right - left),
			height,
			cursor: "row-resize",
		})
	}

	return frames
}
