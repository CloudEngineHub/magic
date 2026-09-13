import type { DevicePreviewConfig, DevicePreviewZoom } from "./types"

export const MIN_PREVIEW_DIMENSION = 160
export const MAX_PREVIEW_DIMENSION = 2560
export const DEVICE_PREVIEW_PADDING = 24
export const DEVICE_PREVIEW_ZOOMS: readonly DevicePreviewZoom[] = ["fit", 0.25, 0.5, 0.75, 1, 1.5]

export const DEFAULT_DEVICE_PREVIEW: DevicePreviewConfig = {
	preset: "custom",
	kind: "phone",
	profile: "modern",
	fold: null,
	width: 390,
	height: 844,
	zoom: "fit",
	showFrame: false,
}

export function isValidDeviceDimension(value: number): boolean {
	return (
		Number.isInteger(value) && value >= MIN_PREVIEW_DIMENSION && value <= MAX_PREVIEW_DIMENSION
	)
}
