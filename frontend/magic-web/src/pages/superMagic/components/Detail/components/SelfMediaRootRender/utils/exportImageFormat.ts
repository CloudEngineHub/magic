export type SelfMediaExportFormat = "png" | "jpg" | "webp"

export const DEFAULT_SELF_MEDIA_EXPORT_FORMAT: SelfMediaExportFormat = "png"
export const SELF_MEDIA_EXPORT_IMAGE_QUALITY = 0.92

export function getExportImageMimeType(format: SelfMediaExportFormat): string {
	if (format === "jpg") return "image/jpeg"
	return `image/${format}`
}
