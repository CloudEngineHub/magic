import type { Rect } from "../../shared/ids"

export type SpacingSnapAxis = "horizontal" | "vertical"
export type SpacingSnapMode = "between" | "extend-before" | "extend-after"

export interface SpacingSnapTarget {
	id: string
	rect: Rect
}

export interface SpacingGuideSegment {
	start: { x: number; y: number }
	end: { x: number; y: number }
}

export interface SpacingGuide {
	axis: SpacingSnapAxis
	gap: number
	targetElementIds: [string, string]
	segments: [SpacingGuideSegment, SpacingGuideSegment]
}

export interface SpacingSnapCandidate {
	axis: SpacingSnapAxis
	mode: SpacingSnapMode
	offset: number
	gap: number
	referenceTargets: [SpacingSnapTarget, SpacingSnapTarget]
}

export interface SpacingSnapResult {
	horizontal: SpacingSnapCandidate | null
	vertical: SpacingSnapCandidate | null
}
