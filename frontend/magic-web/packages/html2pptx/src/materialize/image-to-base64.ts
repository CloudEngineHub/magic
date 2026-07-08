import { fetchBlobWithLimit } from "../shared/fetch"

export interface ImageRoundingParams {
	radiusPx: number
	widthPx: number
	heightPx: number
	sizing: "contain" | "cover" | "crop" | "stretch"
}

export function isSvgSource(src: string): boolean {
	return /^data:image\/svg\+xml/i.test(src) || /\.svg(?:$|[?#])/i.test(src)
}

export function isGifSource(src: string): boolean {
	return /^data:image\/gif/i.test(src) || /\.gif(?:$|[?#])/i.test(src)
}

export function computeTargetMaxPx(w: number, h: number): number {
	return Math.max(1, Math.round(Math.max(w, h) * 96))
}

export async function materializeImage(
	src: string,
	_targetMaxPx?: number,
	_rounding?: ImageRoundingParams,
	signal?: AbortSignal,
): Promise<{ dataUrl: string }> {
	return { dataUrl: await imageToBase64(src, signal) }
}

export async function imageToBase64(src: string, signal?: AbortSignal): Promise<string> {
	if (src.startsWith("data:")) return src
	const { response, blob } = await fetchBlobWithLimit(src, signal)
	if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`)
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader()
		reader.onloadend = () => {
			if (typeof reader.result === "string") resolve(reader.result)
			else reject(new Error("FileReader did not return a string"))
		}
		reader.onerror = () => reject(new Error("FileReader failed"))
		reader.readAsDataURL(blob)
	})
}
