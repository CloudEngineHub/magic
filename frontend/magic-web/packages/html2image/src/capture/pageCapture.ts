import { snapdom } from "@zumer/snapdom"
import { throwIfAborted } from "../sandbox/abort"

export type ImageFormat = "png" | "jpeg"

export interface CaptureInput {
	iDocument: Document
	signal: AbortSignal
}

async function snap(element: HTMLElement, signal: AbortSignal, scaleOverride?: number) {
	throwIfAborted(signal)
	const scale = scaleOverride ?? 2
	return snapdom(element, {
		embedFonts: true,
		cache: "auto",
		fast: true,
		scale,
		backgroundColor: "#ffffff",
	} as Parameters<typeof snapdom>[1])
}

/**
 * 整页截图 → Canvas
 */
export async function captureToCanvas({
	iDocument,
	signal,
	scale,
}: CaptureInput & { scale?: number }): Promise<HTMLCanvasElement> {
	const body = iDocument.body
	const result = await snap(body, signal, scale)
	return result.toCanvas()
}

/**
 * 对任意 DOM 元素截图 → Canvas
 */
export async function captureElementToCanvas({
	element,
	signal,
}: {
	element: HTMLElement
	signal: AbortSignal
}): Promise<HTMLCanvasElement> {
	const result = await snap(element, signal)
	return result.toCanvas()
}

/**
 * Canvas → ArrayBuffer（JPEG/PNG 编码）
 */
export function canvasToArrayBuffer(
	canvas: HTMLCanvasElement,
	imageType: ImageFormat,
	imageQuality: number,
): Promise<ArrayBuffer> {
	const mimeType = imageType === "jpeg" ? "image/jpeg" : "image/png"
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (!blob) {
					reject(new Error("canvas.toBlob returned null"))
					return
				}
				blob.arrayBuffer().then(resolve, reject)
			},
			mimeType,
			mimeType === "image/jpeg" ? imageQuality : undefined,
		)
	})
}
