import type { ImageProcessOptions } from "@/utils/image-processing"

/** Card content images use a 2x source for the 1080px-wide final card output. */
export const CARD_IMAGE_PROCESS: ImageProcessOptions = {
	resize: { w: 2160, m: "lfit" },
	quality: 90,
	format: "webp",
}

/** Card thumbnails in the edit sidebar (~200px wide). */
export const CARD_THUMBNAIL_IMAGE_PROCESS: ImageProcessOptions = {
	resize: { w: 400, m: "lfit" },
	quality: 80,
	format: "webp",
}
