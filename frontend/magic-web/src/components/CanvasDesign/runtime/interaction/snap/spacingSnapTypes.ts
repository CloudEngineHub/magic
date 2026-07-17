import type { Rect } from "../../shared/ids"

export type SpacingSnapAxis = "horizontal" | "vertical"
export type SpacingSnapMode =
	| "between"
	| "extend-before"
	| "extend-after"
	| "grid-before"
	| "grid-after"

export interface SpacingSnapTarget {
	id: string
	rect: Rect
}

export interface SpacingGuideSegment {
	axis: SpacingSnapAxis
	start: { x: number; y: number }
	end: { x: number; y: number }
}

export interface SpacingGuide {
	axis: SpacingSnapAxis
	gap: number
	targetElementIds: [string, string]
	kind: "linear" | "grid"
	sourceAxis?: SpacingSnapAxis
	anchorTargetId?: string
	segments: SpacingGuideSegment[]
}

interface BaseSpacingSnapCandidate {
	axis: SpacingSnapAxis
	mode: SpacingSnapMode
	offset: number
	gap: number
	referenceTargets: [SpacingSnapTarget, SpacingSnapTarget]
}

export interface LinearSpacingSnapCandidate extends BaseSpacingSnapCandidate {
	kind: "linear"
	mode: "between" | "extend-before" | "extend-after"
}

export interface GridSpacingSnapCandidate extends BaseSpacingSnapCandidate {
	kind: "grid"
	mode: "grid-before" | "grid-after"
	sourceAxis: SpacingSnapAxis
	anchorTarget: SpacingSnapTarget
	guideReferencePairs: Array<[SpacingSnapTarget, SpacingSnapTarget]>
}

export type SpacingSnapCandidate = LinearSpacingSnapCandidate | GridSpacingSnapCandidate

export interface SpacingSnapResult {
	horizontal: SpacingSnapCandidate | null
	vertical: SpacingSnapCandidate | null
}
