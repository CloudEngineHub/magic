export type ImageViewingLevel = "low" | "preview" | "full"
export type ImageDisplayViewingLevel = Exclude<ImageViewingLevel, "full">
export type MediaDisplayResourceVariant = "low" | "preview"
export type ImageViewingResourceVariant = MediaDisplayResourceVariant | "full"
export type MediaViewingCachePolicy = "display" | "memory"

export const MEDIA_DISPLAY_RESOURCE_VARIANTS: readonly MediaDisplayResourceVariant[] = [
	"low",
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
	level: ImageViewingLevel
	variant: ImageViewingResourceVariant
	reason: "low-screen-long-edge" | "near-viewport" | "preview-visible" | "full-visible"
	screenArea: number
	screenLongEdge: number
}

const IMAGE_LOW_ENTER_MAX_SCREEN_LONG_EDGE = 128
const IMAGE_LOW_HYSTERESIS_MAX_SCREEN_LONG_EDGE = 320
const IMAGE_LOW_MAX_EDGE = 384
const IMAGE_PREVIEW_MAX_EDGE = 1536
const IMAGE_FULL_ENTER_SCREEN_LONG_EDGE = IMAGE_PREVIEW_MAX_EDGE
const IMAGE_FULL_EXIT_SCREEN_LONG_EDGE = IMAGE_PREVIEW_MAX_EDGE * 0.75
const VIDEO_POSTER_MAX_EDGE = 768

export const IMAGE_VIEWING_LEVEL_RESOURCE_PROFILE: Record<
	ImageViewingLevel,
	ImageViewingResourceProfile
> = {
	low: {
		level: "low",
		variant: "low",
		maxEdge: IMAGE_LOW_MAX_EDGE,
		cachePolicy: "display",
	},
	preview: {
		level: "preview",
		variant: "preview",
		maxEdge: IMAGE_PREVIEW_MAX_EDGE,
		cachePolicy: "display",
	},
	full: {
		level: "full",
		variant: "full",
		cachePolicy: "memory",
	},
}

export const VIDEO_POSTER_RESOURCE_PROFILE: MediaDisplayResourceProfile = {
	level: "preview",
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
	previousVariant?: ImageViewingResourceVariant
}): ImageDisplayViewingLevelDecision {
	const { visibilityState, screenArea, previousVariant } = options
	const screenLongEdge = options.screenLongEdge ?? Math.sqrt(Math.max(0, screenArea))
	const lowEnterMaxScreenLongEdge =
		previousVariant === "preview" ? 96 : IMAGE_LOW_ENTER_MAX_SCREEN_LONG_EDGE
	const lowHysteresisMaxScreenLongEdge =
		previousVariant === "low" ? 360 : IMAGE_LOW_HYSTERESIS_MAX_SCREEN_LONG_EDGE
	const previewExitMaxScreenLongEdge = previousVariant === "preview" ? 340 : 420
	const fullEnterScreenLongEdge =
		previousVariant === "full"
			? IMAGE_FULL_EXIT_SCREEN_LONG_EDGE
			: IMAGE_FULL_ENTER_SCREEN_LONG_EDGE

	if (screenLongEdge <= lowEnterMaxScreenLongEdge) {
		return {
			level: "low",
			variant: "low",
			reason: "low-screen-long-edge",
			screenArea,
			screenLongEdge,
		}
	}
	if (visibilityState === "near") {
		return {
			level: "low",
			variant: "low",
			reason: "near-viewport",
			screenArea,
			screenLongEdge,
		}
	}
	if (previousVariant === "preview" && screenLongEdge > previewExitMaxScreenLongEdge) {
		if (screenLongEdge >= fullEnterScreenLongEdge) {
			return {
				level: "full",
				variant: "full",
				reason: "full-visible",
				screenArea,
				screenLongEdge,
			}
		}
		return {
			level: "preview",
			variant: "preview",
			reason: "preview-visible",
			screenArea,
			screenLongEdge,
		}
	}
	if (screenLongEdge <= lowHysteresisMaxScreenLongEdge) {
		return {
			level: "low",
			variant: "low",
			reason: "low-screen-long-edge",
			screenArea,
			screenLongEdge,
		}
	}
	if (screenLongEdge >= fullEnterScreenLongEdge) {
		return {
			level: "full",
			variant: "full",
			reason: "full-visible",
			screenArea,
			screenLongEdge,
		}
	}
	return {
		level: "preview",
		variant: "preview",
		reason: "preview-visible",
		screenArea,
		screenLongEdge,
	}
}
