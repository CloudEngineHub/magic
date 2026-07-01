export type ImageSizing = "contain" | "cover" | "crop" | "stretch"

export interface ImageRoundingParams {
	radiusPx: number
	widthPx: number
	heightPx: number
	sizing: ImageSizing
}
