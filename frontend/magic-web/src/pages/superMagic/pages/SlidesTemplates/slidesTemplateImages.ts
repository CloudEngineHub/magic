import {
	buildFormatProcess,
	buildQualityProcess,
	buildResizeProcess,
	combineProcesses,
	isTosPublicImageUrl,
} from "@/utils/tos-image"

const CARD_IMAGE_WIDTH = 720
const PREVIEW_AMBIENT_IMAGE_WIDTH = 960
const PREVIEW_THUMBNAIL_IMAGE_WIDTH = 360

function applyTosImageProcess(imageUrl: string | undefined, width: number, quality: number) {
	if (!imageUrl || !isTosPublicImageUrl(imageUrl)) return imageUrl

	const process = combineProcesses([
		buildResizeProcess({ w: width }),
		buildQualityProcess({ Q: quality }),
		buildFormatProcess({ format: "webp" }),
	])
	if (!process) return imageUrl

	try {
		const url = new URL(imageUrl)
		url.searchParams.set("x-tos-process", process)
		return url.toString()
	} catch {
		return imageUrl
	}
}

export function getSlidesTemplateCardImageUrl(imageUrl: string | undefined) {
	return applyTosImageProcess(imageUrl, CARD_IMAGE_WIDTH, 82)
}

export function getSlidesTemplatePreviewAmbientImageUrl(imageUrl: string | undefined) {
	return applyTosImageProcess(imageUrl, PREVIEW_AMBIENT_IMAGE_WIDTH, 84)
}

export function getSlidesTemplatePreviewThumbnailImageUrl(imageUrl: string | undefined) {
	return applyTosImageProcess(imageUrl, PREVIEW_THUMBNAIL_IMAGE_WIDTH, 78)
}
