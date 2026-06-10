import type { Rect } from "./utils"

export type ImageViewingLevel = "tiny" | "overview" | "standard" | "detail"
export type ImageDisplayViewingLevel = Exclude<ImageViewingLevel, "detail">
export type MediaDisplayResourceVariant = "small" | "overview" | "preview"
export type ImageViewingResourceVariant = MediaDisplayResourceVariant | "full"
export type MediaViewingCachePolicy = "display" | "scoped-retain"

export const MEDIA_DISPLAY_RESOURCE_VARIANTS: readonly MediaDisplayResourceVariant[] = [
	"small",
	"overview",
	"preview",
]

export interface ImageViewingResourceProfile {
	level: ImageViewingLevel
	variant: ImageViewingResourceVariant
	maxEdge?: number
	cachePolicy: MediaViewingCachePolicy
}

export interface MediaDisplayResourceProfile {
	level: ImageDisplayViewingLevel
	variant: MediaDisplayResourceVariant
	maxEdge: number
	cachePolicy: "display"
}

export interface ImageDisplayViewingLevelDecision {
	level: ImageDisplayViewingLevel
	variant: Exclude<ImageViewingResourceVariant, "full">
	reason:
		| "tiny-screen-long-edge"
		| "near-viewport"
		| "overview-screen-long-edge"
		| "standard-visible"
	screenArea: number
	screenLongEdge: number
}

const IMAGE_TINY_MAX_SCREEN_LONG_EDGE = 128
const IMAGE_OVERVIEW_MAX_SCREEN_LONG_EDGE = 320
const IMAGE_SMALL_MAX_EDGE = 72
const IMAGE_OVERVIEW_MAX_EDGE = 384
const IMAGE_PREVIEW_MAX_EDGE = 1536
const VIDEO_POSTER_MAX_EDGE = 768

export const IMAGE_VIEWING_LEVEL_RESOURCE_PROFILE: Record<
	ImageViewingLevel,
	ImageViewingResourceProfile
> = {
	tiny: {
		level: "tiny",
		variant: "small",
		maxEdge: IMAGE_SMALL_MAX_EDGE,
		cachePolicy: "display",
	},
	overview: {
		level: "overview",
		variant: "overview",
		maxEdge: IMAGE_OVERVIEW_MAX_EDGE,
		cachePolicy: "display",
	},
	standard: {
		level: "standard",
		variant: "preview",
		maxEdge: IMAGE_PREVIEW_MAX_EDGE,
		cachePolicy: "display",
	},
	detail: {
		level: "detail",
		variant: "full",
		cachePolicy: "scoped-retain",
	},
}

export const VIDEO_POSTER_RESOURCE_PROFILE: MediaDisplayResourceProfile = {
	level: "standard",
	variant: "preview",
	maxEdge: VIDEO_POSTER_MAX_EDGE,
	cachePolicy: "display",
}

export function getImageResourceVariantForViewingLevel(
	level: ImageViewingLevel,
): ImageViewingResourceVariant {
	return IMAGE_VIEWING_LEVEL_RESOURCE_PROFILE[level].variant
}

export function getImageResourceMaxEdge(variant: ImageViewingResourceVariant): number | undefined {
	const profile = Object.values(IMAGE_VIEWING_LEVEL_RESOURCE_PROFILE).find(
		(candidate) => candidate.variant === variant,
	)
	return profile?.maxEdge
}

export function getVideoPosterMaxEdge(): number {
	return VIDEO_POSTER_RESOURCE_PROFILE.maxEdge
}

export function decideImageDisplayViewingLevel(options: {
	visibilityState: "visible" | "near"
	screenArea: number
	screenLongEdge?: number
	previousVariant?: MediaDisplayResourceVariant
}): ImageDisplayViewingLevelDecision {
	const { visibilityState, screenArea, previousVariant } = options
	const screenLongEdge = options.screenLongEdge ?? Math.sqrt(Math.max(0, screenArea))
	const tinyEnterMaxScreenLongEdge =
		previousVariant === "overview" || previousVariant === "preview"
			? 96
			: IMAGE_TINY_MAX_SCREEN_LONG_EDGE
	const overviewEnterMinScreenLongEdge =
		previousVariant === "small" ? 160 : IMAGE_TINY_MAX_SCREEN_LONG_EDGE
	const previewEnterMinScreenLongEdge =
		previousVariant === "overview" ? 360 : IMAGE_OVERVIEW_MAX_SCREEN_LONG_EDGE
	const previewExitMaxScreenLongEdge = previousVariant === "preview" ? 340 : 420

	if (screenLongEdge <= tinyEnterMaxScreenLongEdge) {
		return {
			level: "tiny",
			variant: "small",
			reason: "tiny-screen-long-edge",
			screenArea,
			screenLongEdge,
		}
	}
	if (previousVariant === "small" && screenLongEdge <= overviewEnterMinScreenLongEdge) {
		return {
			level: "tiny",
			variant: "small",
			reason: "tiny-screen-long-edge",
			screenArea,
			screenLongEdge,
		}
	}
	if (visibilityState === "near") {
		return {
			level: "overview",
			variant: "overview",
			reason: "near-viewport",
			screenArea,
			screenLongEdge,
		}
	}
	if (previousVariant === "preview" && screenLongEdge > previewExitMaxScreenLongEdge) {
		return {
			level: "standard",
			variant: "preview",
			reason: "standard-visible",
			screenArea,
			screenLongEdge,
		}
	}
	if (screenLongEdge <= previewEnterMinScreenLongEdge) {
		return {
			level: "overview",
			variant: "overview",
			reason: "overview-screen-long-edge",
			screenArea,
			screenLongEdge,
		}
	}
	return {
		level: "standard",
		variant: "preview",
		reason: "standard-visible",
		screenArea,
		screenLongEdge,
	}
}

export interface ElementViewportMetrics {
	isVisible: boolean
	screenWidth: number
	screenHeight: number
	screenLongEdge: number
	screenArea: number
	intersectionArea: number
	visibleElementAreaRatio: number
	visibleViewportAreaRatio: number
}

export type MediaDetailDecisionReason =
	| "display-exceeds-preview"
	| "not-visible"
	| "preview-size-missing"
	| "preview-still-enough"
	| "full-too-large"

export interface MediaDetailDecision {
	target: "full" | "preview"
	reason: MediaDetailDecisionReason
	displayToPreviewRatio: number
	thresholdRatio: number
}

export interface MediaDetailDecisionOptions {
	metrics: ElementViewportMetrics
	previewLongEdge: number
	isActive: boolean
	fullDecodedBytes: number
	fullNativeBytes: number
	maxFullDecodedBytes: number
	maxFullNativeBytes: number
	enterDisplayToPreviewRatio: number
	exitDisplayToPreviewRatio: number
}

function getArea(rect: Rect): number {
	return Math.max(0, rect.width) * Math.max(0, rect.height)
}

function getIntersectionArea(a: Rect, b: Rect): number {
	const x1 = Math.max(a.x, b.x)
	const y1 = Math.max(a.y, b.y)
	const x2 = Math.min(a.x + a.width, b.x + b.width)
	const y2 = Math.min(a.y + a.height, b.y + b.height)
	return Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
}

export function computeElementViewportMetrics(options: {
	bounds: Rect
	viewportRect: Rect
	viewportScale: number
}): ElementViewportMetrics {
	const { bounds, viewportRect, viewportScale } = options
	const screenWidth = Math.max(0, bounds.width) * viewportScale
	const screenHeight = Math.max(0, bounds.height) * viewportScale
	const screenLongEdge = Math.max(screenWidth, screenHeight)
	const screenArea = screenWidth * screenHeight
	const elementArea = getArea(bounds)
	const viewportArea = getArea(viewportRect)
	const intersectionArea = getIntersectionArea(bounds, viewportRect)

	return {
		isVisible: intersectionArea > 0,
		screenWidth,
		screenHeight,
		screenLongEdge,
		screenArea,
		intersectionArea,
		visibleElementAreaRatio: elementArea > 0 ? Math.min(1, intersectionArea / elementArea) : 0,
		visibleViewportAreaRatio:
			viewportArea > 0 ? Math.min(1, intersectionArea / viewportArea) : 0,
	}
}

export function decideMediaDetailLevel(options: MediaDetailDecisionOptions): MediaDetailDecision {
	const {
		metrics,
		previewLongEdge,
		isActive,
		fullDecodedBytes,
		fullNativeBytes,
		maxFullDecodedBytes,
		maxFullNativeBytes,
		enterDisplayToPreviewRatio,
		exitDisplayToPreviewRatio,
	} = options
	const thresholdRatio = isActive ? exitDisplayToPreviewRatio : enterDisplayToPreviewRatio
	const displayToPreviewRatio = previewLongEdge > 0 ? metrics.screenLongEdge / previewLongEdge : 0

	if (!metrics.isVisible) {
		return {
			target: "preview",
			reason: "not-visible",
			displayToPreviewRatio,
			thresholdRatio,
		}
	}

	if (previewLongEdge <= 0) {
		return {
			target: "preview",
			reason: "preview-size-missing",
			displayToPreviewRatio,
			thresholdRatio,
		}
	}

	if (
		fullDecodedBytes <= 0 ||
		fullDecodedBytes > maxFullDecodedBytes ||
		fullNativeBytes > maxFullNativeBytes
	) {
		return {
			target: "preview",
			reason: "full-too-large",
			displayToPreviewRatio,
			thresholdRatio,
		}
	}

	if (displayToPreviewRatio < thresholdRatio) {
		return {
			target: "preview",
			reason: "preview-still-enough",
			displayToPreviewRatio,
			thresholdRatio,
		}
	}

	return {
		target: "full",
		reason: "display-exceeds-preview",
		displayToPreviewRatio,
		thresholdRatio,
	}
}
