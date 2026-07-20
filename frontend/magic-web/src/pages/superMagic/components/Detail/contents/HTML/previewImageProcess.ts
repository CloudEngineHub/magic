import type { ImageProcessOptions } from "@/utils/image-processing"

/**
 * HTML/PPT 预览只请求 WebP 变体，避免大尺寸 PNG/JPEG 在预览 iframe 内直接解码。
 * 不设置 resize，保持现有画布尺寸与版式不变。
 */
export const HTML_PREVIEW_IMAGE_PROCESS = {
	format: "webp",
} satisfies ImageProcessOptions
