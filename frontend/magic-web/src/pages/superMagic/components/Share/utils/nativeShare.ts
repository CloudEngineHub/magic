export type NativeShareResult = "shared" | "unsupported" | "cancelled" | "failed"

export interface NativeSharePayload {
	title?: string
	text?: string
	url?: string
}

/**
 * Detects whether the current browser exposes the Web Share API used by mobile system share sheets.
 */
export function canUseNativeShare(): boolean {
	return typeof navigator !== "undefined" && typeof navigator.share === "function"
}

/**
 * Opens the mobile system share sheet and normalizes browser-specific failures for callers.
 */
export async function shareToNativeTarget(payload: NativeSharePayload): Promise<NativeShareResult> {
	if (!canUseNativeShare()) {
		return "unsupported"
	}

	try {
		await navigator.share({
			title: payload.title,
			text: payload.text,
			url: payload.url,
		})
		return "shared"
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") {
			return "cancelled"
		}

		return "failed"
	}
}
