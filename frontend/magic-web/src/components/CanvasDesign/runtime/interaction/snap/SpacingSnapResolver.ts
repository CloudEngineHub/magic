import type { Rect } from "../../shared/ids"
import type {
	SpacingGuide,
	SpacingSnapAxis,
	SpacingSnapCandidate,
	SpacingSnapResult,
	SpacingSnapTarget,
} from "./spacingSnapTypes"

const MIN_CROSS_AXIS_OVERLAP_RATIO = 0.5
const MAX_TARGETS_PER_SIDE = 8

/**
 * 解析单元素平移时的等间距吸附。
 *
 * 仅在拖拽元素位于两个同层目标之间，且三者处于同一行或同一列时生效。
 * 这使等距吸附保持为明确的布局意图，而不是从任意斜向元素中猜测关系。
 */
export class SpacingSnapResolver {
	resolve(params: {
		draggingRect: Rect
		targets: SpacingSnapTarget[]
		threshold: number
	}): SpacingSnapResult {
		const { draggingRect, targets, threshold } = params
		return {
			horizontal: this.findClosestCandidate({
				draggingRect,
				targets,
				threshold,
				axis: "horizontal",
			}),
			vertical: this.findClosestCandidate({
				draggingRect,
				targets,
				threshold,
				axis: "vertical",
			}),
		}
	}

	private findClosestCandidate(params: {
		draggingRect: Rect
		targets: SpacingSnapTarget[]
		threshold: number
		axis: SpacingSnapAxis
	}): SpacingSnapCandidate | null {
		const { draggingRect, targets, threshold, axis } = params
		const firstTargets = this.getTargetsOnSide({
			draggingRect,
			targets,
			threshold,
			axis,
			side: "before",
		})
		const secondTargets = this.getTargetsOnSide({
			draggingRect,
			targets,
			threshold,
			axis,
			side: "after",
		})
		let closest: SpacingSnapCandidate | null = null

		for (const firstTarget of firstTargets) {
			for (const secondTarget of secondTargets) {
				const candidate = this.createCandidate({
					draggingRect,
					firstTarget,
					secondTarget,
					axis,
				})
				if (!candidate || Math.abs(candidate.offset) > threshold) continue

				if (!closest || Math.abs(candidate.offset) < Math.abs(closest.offset)) {
					closest = candidate
				}
			}
		}

		return closest
	}

	private getTargetsOnSide(params: {
		draggingRect: Rect
		targets: SpacingSnapTarget[]
		threshold: number
		axis: SpacingSnapAxis
		side: "before" | "after"
	}): SpacingSnapTarget[] {
		const { draggingRect, targets, threshold, axis, side } = params
		const draggingStart = this.getAxisStart(draggingRect, axis)
		const draggingEnd = this.getAxisEnd(draggingRect, axis)
		const distanceToDraggingRect = (target: SpacingSnapTarget): number =>
			side === "before"
				? draggingStart - this.getAxisEnd(target.rect, axis)
				: this.getAxisStart(target.rect, axis) - draggingEnd

		return targets
			.filter((target) => {
				if (!this.hasCrossAxisOverlap(draggingRect, target.rect, axis)) return false
				return side === "before"
					? this.getAxisEnd(target.rect, axis) <= draggingStart + threshold
					: this.getAxisStart(target.rect, axis) >= draggingEnd - threshold
			})
			.sort((a, b) => distanceToDraggingRect(a) - distanceToDraggingRect(b))
			.slice(0, MAX_TARGETS_PER_SIDE)
	}

	private createCandidate(params: {
		draggingRect: Rect
		firstTarget: SpacingSnapTarget
		secondTarget: SpacingSnapTarget
		axis: SpacingSnapAxis
	}): SpacingSnapCandidate | null {
		const { draggingRect, firstTarget, secondTarget, axis } = params
		const firstRect = firstTarget.rect
		const secondRect = secondTarget.rect
		const firstEnd = this.getAxisEnd(firstRect, axis)
		const secondStart = this.getAxisStart(secondRect, axis)
		if (firstEnd > secondStart) return null

		const draggingStart = this.getAxisStart(draggingRect, axis)
		const draggingSize = this.getAxisSize(draggingRect, axis)
		const totalAvailableGap = secondStart - firstEnd - draggingSize
		if (totalAvailableGap < 0) return null

		const equalGap = totalAvailableGap / 2
		const desiredStart = firstEnd + equalGap
		const offset = desiredStart - draggingStart
		return {
			kind: "linear",
			axis,
			mode: "between",
			offset,
			gap: equalGap,
			referenceTargets: [firstTarget, secondTarget],
		}
	}

	/**
	 * 间距吸附和普通对齐可以同时作用于不同轴。绘制时必须使用合并后的矩形，
	 * 才能让间距线与最终静止的拖拽元素保持居中。
	 */
	createGuideForSnappedRect(
		candidate: SpacingSnapCandidate,
		snappedDraggingRect: Rect,
	): SpacingGuide {
		const [firstTarget, secondTarget] = candidate.referenceTargets
		if (candidate.kind === "grid") {
			return this.createGridGuide({ candidate, snappedDraggingRect })
		}
		if (candidate.mode === "between") {
			return this.createBetweenGuide({
				axis: candidate.axis,
				gap: candidate.gap,
				firstTarget,
				secondTarget,
				snappedDraggingRect,
			})
		}

		return this.createExtensionGuide({
			axis: candidate.axis,
			mode: candidate.mode,
			gap: candidate.gap,
			firstTarget,
			secondTarget,
			snappedDraggingRect,
		})
	}

	private createGridGuide(params: {
		candidate: Extract<SpacingSnapCandidate, { kind: "grid" }>
		snappedDraggingRect: Rect
	}): SpacingGuide {
		const { candidate, snappedDraggingRect } = params
		const [firstTarget, secondTarget] = candidate.referenceTargets
		const { anchorTarget, sourceAxis, axis, mode } = candidate
		const referenceSegments = candidate.guideReferencePairs.map(
			([referenceFirstTarget, referenceSecondTarget]) => {
				const referencePosition = this.getCrossAxisOverlapCenter(
					referenceFirstTarget.rect,
					referenceSecondTarget.rect,
					sourceAxis,
				)
				return sourceAxis === "horizontal"
					? {
							axis: "horizontal" as const,
							start: {
								x: this.getAxisEnd(referenceFirstTarget.rect, sourceAxis),
								y: referencePosition,
							},
							end: {
								x: this.getAxisStart(referenceSecondTarget.rect, sourceAxis),
								y: referencePosition,
							},
						}
					: {
							axis: "vertical" as const,
							start: {
								x: referencePosition,
								y: this.getAxisEnd(referenceFirstTarget.rect, sourceAxis),
							},
							end: {
								x: referencePosition,
								y: this.getAxisStart(referenceSecondTarget.rect, sourceAxis),
							},
						}
			},
		)
		const gridPosition = this.getCrossAxisOverlapCenter(
			anchorTarget.rect,
			snappedDraggingRect,
			axis,
		)

		return {
			kind: "grid",
			axis,
			sourceAxis,
			anchorTargetId: anchorTarget.id,
			gap: candidate.gap,
			targetElementIds: [firstTarget.id, secondTarget.id],
			segments: [
				...referenceSegments,
				sourceAxis === "horizontal"
					? {
							axis: "vertical",
							start: {
								x: gridPosition,
								y:
									mode === "grid-after"
										? this.getAxisEnd(anchorTarget.rect, axis)
										: this.getAxisEnd(snappedDraggingRect, axis),
							},
							end: {
								x: gridPosition,
								y:
									mode === "grid-after"
										? snappedDraggingRect.y
										: this.getAxisStart(anchorTarget.rect, axis),
							},
						}
					: {
							axis: "horizontal",
							start: {
								x:
									mode === "grid-after"
										? this.getAxisEnd(anchorTarget.rect, axis)
										: this.getAxisEnd(snappedDraggingRect, axis),
								y: gridPosition,
							},
							end: {
								x:
									mode === "grid-after"
										? snappedDraggingRect.x
										: this.getAxisStart(anchorTarget.rect, axis),
								y: gridPosition,
							},
						},
			],
		}
	}

	private createBetweenGuide(params: {
		axis: SpacingSnapAxis
		gap: number
		firstTarget: SpacingSnapTarget
		secondTarget: SpacingSnapTarget
		snappedDraggingRect: Rect
	}): SpacingGuide {
		const { axis, gap, firstTarget, secondTarget, snappedDraggingRect } = params
		if (axis === "horizontal") {
			const firstGapY = this.getCrossAxisOverlapCenter(
				firstTarget.rect,
				snappedDraggingRect,
				axis,
			)
			const secondGapY = this.getCrossAxisOverlapCenter(
				snappedDraggingRect,
				secondTarget.rect,
				axis,
			)
			return {
				kind: "linear",
				axis,
				gap,
				targetElementIds: [firstTarget.id, secondTarget.id],
				segments: [
					{
						axis: "horizontal",
						start: { x: this.getAxisEnd(firstTarget.rect, axis), y: firstGapY },
						end: { x: snappedDraggingRect.x, y: firstGapY },
					},
					{
						axis: "horizontal",
						start: {
							x: snappedDraggingRect.x + snappedDraggingRect.width,
							y: secondGapY,
						},
						end: { x: this.getAxisStart(secondTarget.rect, axis), y: secondGapY },
					},
				],
			}
		}

		const firstGapX = this.getCrossAxisOverlapCenter(
			firstTarget.rect,
			snappedDraggingRect,
			axis,
		)
		const secondGapX = this.getCrossAxisOverlapCenter(
			snappedDraggingRect,
			secondTarget.rect,
			axis,
		)
		return {
			kind: "linear",
			axis,
			gap,
			targetElementIds: [firstTarget.id, secondTarget.id],
			segments: [
				{
					axis: "vertical",
					start: { x: firstGapX, y: this.getAxisEnd(firstTarget.rect, axis) },
					end: { x: firstGapX, y: snappedDraggingRect.y },
				},
				{
					axis: "vertical",
					start: {
						x: secondGapX,
						y: snappedDraggingRect.y + snappedDraggingRect.height,
					},
					end: { x: secondGapX, y: this.getAxisStart(secondTarget.rect, axis) },
				},
			],
		}
	}

	private createExtensionGuide(params: {
		axis: SpacingSnapAxis
		mode: "extend-before" | "extend-after"
		gap: number
		firstTarget: SpacingSnapTarget
		secondTarget: SpacingSnapTarget
		snappedDraggingRect: Rect
	}): SpacingGuide {
		const { axis, mode, gap, firstTarget, secondTarget, snappedDraggingRect } = params
		const firstSegmentStart = mode === "extend-before" ? snappedDraggingRect : firstTarget.rect
		const firstSegmentEnd = mode === "extend-before" ? firstTarget.rect : secondTarget.rect
		const secondSegmentStart = mode === "extend-before" ? firstTarget.rect : secondTarget.rect
		const secondSegmentEnd = mode === "extend-before" ? secondTarget.rect : snappedDraggingRect

		if (axis === "horizontal") {
			const firstY = this.getCrossAxisOverlapCenter(firstSegmentStart, firstSegmentEnd, axis)
			const secondY = this.getCrossAxisOverlapCenter(
				secondSegmentStart,
				secondSegmentEnd,
				axis,
			)
			return {
				kind: "linear",
				axis,
				gap,
				targetElementIds: [firstTarget.id, secondTarget.id],
				segments: [
					{
						axis: "horizontal",
						start: { x: this.getAxisEnd(firstSegmentStart, axis), y: firstY },
						end: { x: this.getAxisStart(firstSegmentEnd, axis), y: firstY },
					},
					{
						axis: "horizontal",
						start: { x: this.getAxisEnd(secondSegmentStart, axis), y: secondY },
						end: { x: this.getAxisStart(secondSegmentEnd, axis), y: secondY },
					},
				],
			}
		}

		const firstX = this.getCrossAxisOverlapCenter(firstSegmentStart, firstSegmentEnd, axis)
		const secondX = this.getCrossAxisOverlapCenter(secondSegmentStart, secondSegmentEnd, axis)
		return {
			kind: "linear",
			axis,
			gap,
			targetElementIds: [firstTarget.id, secondTarget.id],
			segments: [
				{
					axis: "vertical",
					start: { x: firstX, y: this.getAxisEnd(firstSegmentStart, axis) },
					end: { x: firstX, y: this.getAxisStart(firstSegmentEnd, axis) },
				},
				{
					axis: "vertical",
					start: { x: secondX, y: this.getAxisEnd(secondSegmentStart, axis) },
					end: { x: secondX, y: this.getAxisStart(secondSegmentEnd, axis) },
				},
			],
		}
	}

	private getCrossAxisOverlapCenter(
		firstRect: Rect,
		secondRect: Rect,
		axis: SpacingSnapAxis,
	): number {
		const firstStart = axis === "horizontal" ? firstRect.y : firstRect.x
		const firstEnd = firstStart + (axis === "horizontal" ? firstRect.height : firstRect.width)
		const secondStart = axis === "horizontal" ? secondRect.y : secondRect.x
		const secondEnd =
			secondStart + (axis === "horizontal" ? secondRect.height : secondRect.width)
		const overlapStart = Math.max(firstStart, secondStart)
		const overlapEnd = Math.min(firstEnd, secondEnd)

		if (overlapEnd >= overlapStart) return (overlapStart + overlapEnd) / 2

		return (
			(this.getCrossAxisCenter(firstRect, axis) + this.getCrossAxisCenter(secondRect, axis)) /
			2
		)
	}

	private getCrossAxisCenter(rect: Rect, axis: SpacingSnapAxis): number {
		return axis === "horizontal" ? rect.y + rect.height / 2 : rect.x + rect.width / 2
	}

	private hasCrossAxisOverlap(
		draggingRect: Rect,
		targetRect: Rect,
		axis: SpacingSnapAxis,
	): boolean {
		const draggingStart = axis === "horizontal" ? draggingRect.y : draggingRect.x
		const draggingSize = axis === "horizontal" ? draggingRect.height : draggingRect.width
		const targetStart = axis === "horizontal" ? targetRect.y : targetRect.x
		const targetSize = axis === "horizontal" ? targetRect.height : targetRect.width
		const overlap =
			Math.min(draggingStart + draggingSize, targetStart + targetSize) -
			Math.max(draggingStart, targetStart)

		return overlap >= Math.min(draggingSize, targetSize) * MIN_CROSS_AXIS_OVERLAP_RATIO
	}

	private getAxisStart(rect: Rect, axis: SpacingSnapAxis): number {
		return axis === "horizontal" ? rect.x : rect.y
	}

	private getAxisEnd(rect: Rect, axis: SpacingSnapAxis): number {
		return this.getAxisStart(rect, axis) + this.getAxisSize(rect, axis)
	}

	private getAxisSize(rect: Rect, axis: SpacingSnapAxis): number {
		return axis === "horizontal" ? rect.width : rect.height
	}
}
