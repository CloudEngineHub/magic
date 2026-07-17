import type { Rect } from "../../shared/ids"
import type {
	SpacingSnapAxis,
	SpacingSnapCandidate,
	SpacingSnapResult,
	SpacingSnapTarget,
} from "./spacingSnapTypes"

const MIN_CROSS_AXIS_OVERLAP_RATIO = 0.5

export interface PreparedSequence {
	axis: SpacingSnapAxis
	firstTarget: SpacingSnapTarget
	secondTarget: SpacingSnapTarget
	gap: number
}

export type PreparedSequences = Record<SpacingSnapAxis, PreparedSequence[]>

/**
 * 从已有相邻元素对延展等间距。
 *
 * 例如 A-B 已有间距 g，拖拽 C 到 B 右侧时，吸附到 B-C 也为 g 的位置。
 * 相邻元素对仅在拖拽开始时建立，避免每个 dragmove 扫描整层元素。
 */
export class SequenceSpacingResolver {
	private preparedSequences: PreparedSequences = {
		horizontal: [],
		vertical: [],
	}

	prepare(targets: SpacingSnapTarget[]): void {
		this.preparedSequences = {
			horizontal: this.createPreparedSequences(targets, "horizontal"),
			vertical: this.createPreparedSequences(targets, "vertical"),
		}
	}

	clear(): void {
		this.preparedSequences = { horizontal: [], vertical: [] }
	}

	getPreparedSequences(): PreparedSequences {
		return {
			horizontal: [...this.preparedSequences.horizontal],
			vertical: [...this.preparedSequences.vertical],
		}
	}

	resolve(params: { draggingRect: Rect; threshold: number }): SpacingSnapResult {
		const { draggingRect, threshold } = params
		return {
			horizontal: this.findClosestCandidate({ axis: "horizontal", draggingRect, threshold }),
			vertical: this.findClosestCandidate({ axis: "vertical", draggingRect, threshold }),
		}
	}

	resolveForPair(params: {
		axis: SpacingSnapAxis
		mode: "extend-before" | "extend-after"
		draggingRect: Rect
		targetElementIds: [string, string]
		threshold: number
	}): SpacingSnapCandidate | null {
		const { axis, mode, draggingRect, targetElementIds, threshold } = params
		const sequence = this.preparedSequences[axis].find(
			(item) =>
				item.firstTarget.id === targetElementIds[0] &&
				item.secondTarget.id === targetElementIds[1],
		)
		if (!sequence) return null

		return this.createCandidate({ sequence, mode, draggingRect, threshold })
	}

	private createPreparedSequences(
		targets: SpacingSnapTarget[],
		axis: SpacingSnapAxis,
	): PreparedSequence[] {
		return targets.flatMap((secondTarget) => {
			const firstTarget = targets
				.filter(
					(target) =>
						target.id !== secondTarget.id &&
						this.getAxisEnd(target.rect, axis) <=
							this.getAxisStart(secondTarget.rect, axis) &&
						this.hasCrossAxisOverlap(target.rect, secondTarget.rect, axis),
				)
				.reduce<SpacingSnapTarget | null>((closest, target) => {
					if (
						!closest ||
						this.getAxisEnd(target.rect, axis) > this.getAxisEnd(closest.rect, axis)
					) {
						return target
					}
					return closest
				}, null)
			if (!firstTarget) return []

			return [
				{
					axis,
					firstTarget,
					secondTarget,
					gap:
						this.getAxisStart(secondTarget.rect, axis) -
						this.getAxisEnd(firstTarget.rect, axis),
				},
			]
		})
	}

	private findClosestCandidate(params: {
		axis: SpacingSnapAxis
		draggingRect: Rect
		threshold: number
	}): SpacingSnapCandidate | null {
		const { axis, draggingRect, threshold } = params
		let closest: SpacingSnapCandidate | null = null

		for (const sequence of this.preparedSequences[axis]) {
			for (const mode of ["extend-before", "extend-after"] as const) {
				const candidate = this.createCandidate({ sequence, mode, draggingRect, threshold })
				if (!candidate || Math.abs(candidate.offset) > threshold) continue
				if (!closest || Math.abs(candidate.offset) < Math.abs(closest.offset)) {
					closest = candidate
				}
			}
		}

		return closest
	}

	private createCandidate(params: {
		sequence: PreparedSequence
		mode: "extend-before" | "extend-after"
		draggingRect: Rect
		threshold: number
	}): SpacingSnapCandidate | null {
		const { sequence, mode, draggingRect, threshold } = params
		const { axis, firstTarget, secondTarget, gap } = sequence
		if (
			!this.hasCrossAxisOverlap(draggingRect, firstTarget.rect, axis) ||
			!this.hasCrossAxisOverlap(draggingRect, secondTarget.rect, axis)
		) {
			return null
		}

		const draggingStart = this.getAxisStart(draggingRect, axis)
		const draggingEnd = this.getAxisEnd(draggingRect, axis)
		const desiredStart =
			mode === "extend-after"
				? this.getAxisEnd(secondTarget.rect, axis) + gap
				: this.getAxisStart(firstTarget.rect, axis) -
					gap -
					this.getAxisSize(draggingRect, axis)
		const offset = desiredStart - draggingStart
		const isOnExpectedSide =
			mode === "extend-after"
				? draggingStart >= this.getAxisEnd(secondTarget.rect, axis) - threshold
				: draggingEnd <= this.getAxisStart(firstTarget.rect, axis) + threshold
		if (!isOnExpectedSide || Math.abs(offset) > threshold) return null

		return {
			kind: "linear",
			axis,
			mode,
			offset,
			gap,
			referenceTargets: [firstTarget, secondTarget],
		}
	}

	private hasCrossAxisOverlap(firstRect: Rect, secondRect: Rect, axis: SpacingSnapAxis): boolean {
		const firstStart = axis === "horizontal" ? firstRect.y : firstRect.x
		const firstSize = axis === "horizontal" ? firstRect.height : firstRect.width
		const secondStart = axis === "horizontal" ? secondRect.y : secondRect.x
		const secondSize = axis === "horizontal" ? secondRect.height : secondRect.width
		const overlap =
			Math.min(firstStart + firstSize, secondStart + secondSize) -
			Math.max(firstStart, secondStart)
		return overlap >= Math.min(firstSize, secondSize) * MIN_CROSS_AXIS_OVERLAP_RATIO
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
