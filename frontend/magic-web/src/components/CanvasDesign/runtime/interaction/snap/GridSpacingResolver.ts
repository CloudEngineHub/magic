import type { Rect } from "../../shared/ids"
import type { PreparedSequence, PreparedSequences } from "./SequenceSpacingResolver"
import type {
	GridSpacingSnapCandidate,
	SpacingSnapAxis,
	SpacingSnapResult,
	SpacingSnapTarget,
} from "./spacingSnapTypes"

const GAP_EPSILON = 0.01

/**
 * 将同一行或列的既有 gap 延展到正交方向。
 *
 * 例如 A-B 为横向相邻对且 gap 为 g 时，B 下方的 D 可复用 g。
 * 是否严格同列/同行由调用方确认锚点的直接对齐。
 */
export class GridSpacingResolver {
	private preparedSequences: PreparedSequences = { horizontal: [], vertical: [] }

	prepare(preparedSequences: PreparedSequences): void {
		this.preparedSequences = {
			horizontal: [...preparedSequences.horizontal],
			vertical: [...preparedSequences.vertical],
		}
	}

	clear(): void {
		this.preparedSequences = { horizontal: [], vertical: [] }
	}

	resolve(params: {
		draggingRect: Rect
		threshold: number
		isAnchorAligned?: (anchorTargetId: string, axis: SpacingSnapAxis) => boolean
	}): SpacingSnapResult {
		const { draggingRect, threshold, isAnchorAligned } = params
		return {
			horizontal: this.findClosestCandidate({
				draggingRect,
				threshold,
				sourceAxis: "vertical",
				isAnchorAligned,
			}),
			vertical: this.findClosestCandidate({
				draggingRect,
				threshold,
				sourceAxis: "horizontal",
				isAnchorAligned,
			}),
		}
	}

	resolveForReference(params: {
		axis: SpacingSnapAxis
		sourceAxis: SpacingSnapAxis
		mode: "grid-before" | "grid-after"
		draggingRect: Rect
		targetElementIds: [string, string]
		anchorTargetId: string
		threshold: number
	}): GridSpacingSnapCandidate | null {
		const {
			axis,
			sourceAxis,
			mode,
			draggingRect,
			targetElementIds,
			anchorTargetId,
			threshold,
		} = params
		if (this.getPerpendicularAxis(sourceAxis) !== axis) return null
		const sequence = this.preparedSequences[sourceAxis].find(
			(item) =>
				item.firstTarget.id === targetElementIds[0] &&
				item.secondTarget.id === targetElementIds[1],
		)
		if (!sequence) return null
		const anchorTarget = [sequence.firstTarget, sequence.secondTarget].find(
			(target) => target.id === anchorTargetId,
		)
		if (!anchorTarget) return null

		return this.createCandidate({
			sequence,
			anchorTarget,
			axis,
			mode,
			draggingRect,
			threshold,
		})
	}

	private findClosestCandidate(params: {
		draggingRect: Rect
		threshold: number
		sourceAxis: SpacingSnapAxis
		isAnchorAligned?: (anchorTargetId: string, axis: SpacingSnapAxis) => boolean
	}): GridSpacingSnapCandidate | null {
		const { draggingRect, threshold, sourceAxis, isAnchorAligned } = params
		const axis = this.getPerpendicularAxis(sourceAxis)
		let closest: GridSpacingSnapCandidate | null = null

		for (const sequence of this.preparedSequences[sourceAxis]) {
			for (const anchorTarget of [sequence.firstTarget, sequence.secondTarget]) {
				if (isAnchorAligned && !isAnchorAligned(anchorTarget.id, axis)) continue
				for (const mode of ["grid-before", "grid-after"] as const) {
					const candidate = this.createCandidate({
						sequence,
						anchorTarget,
						axis,
						mode,
						draggingRect,
						threshold,
					})
					if (!candidate) continue
					if (!closest || Math.abs(candidate.offset) < Math.abs(closest.offset)) {
						closest = candidate
					}
				}
			}
		}

		return closest
	}

	private createCandidate(params: {
		sequence: PreparedSequence
		anchorTarget: PreparedSequence["firstTarget"]
		axis: SpacingSnapAxis
		mode: "grid-before" | "grid-after"
		draggingRect: Rect
		threshold: number
	}): GridSpacingSnapCandidate | null {
		const { sequence, anchorTarget, axis, mode, draggingRect, threshold } = params
		const draggingStart = this.getAxisStart(draggingRect, axis)
		const draggingEnd = this.getAxisEnd(draggingRect, axis)
		const desiredStart =
			mode === "grid-after"
				? this.getAxisEnd(anchorTarget.rect, axis) + sequence.gap
				: this.getAxisStart(anchorTarget.rect, axis) -
					sequence.gap -
					this.getAxisSize(draggingRect, axis)
		const offset = desiredStart - draggingStart
		const isOnExpectedSide =
			mode === "grid-after"
				? draggingStart >= this.getAxisEnd(anchorTarget.rect, axis) - threshold
				: draggingEnd <= this.getAxisStart(anchorTarget.rect, axis) + threshold
		if (!isOnExpectedSide || Math.abs(offset) > threshold) return null

		return {
			kind: "grid",
			axis,
			mode,
			offset,
			gap: sequence.gap,
			sourceAxis: sequence.axis,
			anchorTarget,
			referenceTargets: [sequence.firstTarget, sequence.secondTarget],
			guideReferencePairs: this.getGuideReferencePairs(sequence, anchorTarget),
		}
	}

	private getGuideReferencePairs(
		sequence: PreparedSequence,
		anchorTarget: SpacingSnapTarget,
	): Array<[SpacingSnapTarget, SpacingSnapTarget]> {
		return this.preparedSequences[sequence.axis]
			.filter(
				(item) =>
					(item.firstTarget.id === anchorTarget.id ||
						item.secondTarget.id === anchorTarget.id) &&
					Math.abs(item.gap - sequence.gap) <= GAP_EPSILON,
			)
			.sort(
				(first, second) =>
					this.getAxisStart(first.firstTarget.rect, sequence.axis) -
					this.getAxisStart(second.firstTarget.rect, sequence.axis),
			)
			.map((item) => [item.firstTarget, item.secondTarget])
	}

	private getPerpendicularAxis(axis: SpacingSnapAxis): SpacingSnapAxis {
		return axis === "horizontal" ? "vertical" : "horizontal"
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
