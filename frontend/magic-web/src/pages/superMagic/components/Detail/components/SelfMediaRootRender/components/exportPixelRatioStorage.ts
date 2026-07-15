const PIXEL_RATIO_OPTIONS = [1, 2, 4] as const
const STORAGE_KEY = "dtyq:self-media:export-pixel-ratio"

function isPixelRatioOption(value: number): value is (typeof PIXEL_RATIO_OPTIONS)[number] {
	return (PIXEL_RATIO_OPTIONS as readonly number[]).includes(value)
}

export function readStoredPixelRatio(): number {
	if (typeof window === "undefined") return 2
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY)
		const parsed = raw === null || raw === "" ? NaN : Number(raw)
		if (isPixelRatioOption(parsed)) return parsed
	} catch {
		// Ignore quota and private-mode storage failures.
	}
	return 2
}

export function persistPixelRatio(ratio: number): void {
	if (typeof window === "undefined" || !isPixelRatioOption(ratio)) return
	try {
		window.localStorage.setItem(STORAGE_KEY, String(ratio))
	} catch {
		// Ignore quota and private-mode storage failures.
	}
}
