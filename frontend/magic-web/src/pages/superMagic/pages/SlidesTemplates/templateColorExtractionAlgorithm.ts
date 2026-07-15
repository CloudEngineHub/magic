import {
	getTemplateOklabDistance,
	normalizeTemplateColors,
	templateHexToOklab,
} from "./templateColors"

const MAX_PALETTE_COLORS = 5
const MIN_PALETTE_COLORS = 3
const MAX_CANDIDATE_COLORS = 64
const MIN_ALPHA = 160
const MIN_DISTINCT_COLOR_DISTANCE = 0.045

interface ColorBucket {
	blueTotal: number
	count: number
	greenTotal: number
	redTotal: number
}

interface PaletteCandidate {
	count: number
	hex: string
}

function channelToHex(channel: number) {
	return Math.min(255, Math.max(0, Math.round(channel)))
		.toString(16)
		.padStart(2, "0")
}

function rgbToHex(red: number, green: number, blue: number) {
	return `#${channelToHex(red)}${channelToHex(green)}${channelToHex(blue)}`.toUpperCase()
}

function hexToRgb(color: string) {
	return {
		red: Number.parseInt(color.slice(1, 3), 16),
		green: Number.parseInt(color.slice(3, 5), 16),
		blue: Number.parseInt(color.slice(5, 7), 16),
	}
}

function mixHexColor(color: string, target: "#000000" | "#FFFFFF", ratio: number) {
	const sourceRgb = hexToRgb(color)
	const targetRgb = hexToRgb(target)
	return rgbToHex(
		sourceRgb.red + (targetRgb.red - sourceRgb.red) * ratio,
		sourceRgb.green + (targetRgb.green - sourceRgb.green) * ratio,
		sourceRgb.blue + (targetRgb.blue - sourceRgb.blue) * ratio,
	)
}

function getMinimumPaletteDistance(color: string, palette: string[]) {
	const colorLab = templateHexToOklab(color)
	return Math.min(
		...palette.map((paletteColor) =>
			getTemplateOklabDistance(colorLab, templateHexToOklab(paletteColor)),
		),
	)
}

function ensureMinimumPaletteSize(palette: string[]) {
	const primaryColor = palette[0]
	if (!primaryColor || palette.length >= MIN_PALETTE_COLORS) return palette

	const variants = [
		mixHexColor(primaryColor, "#FFFFFF", 0.24),
		mixHexColor(primaryColor, "#000000", 0.22),
		mixHexColor(primaryColor, "#FFFFFF", 0.42),
		mixHexColor(primaryColor, "#000000", 0.4),
	]
	const nextPalette = [...palette]

	for (const variant of variants) {
		if (nextPalette.length >= MIN_PALETTE_COLORS) break
		if (getMinimumPaletteDistance(variant, nextPalette) < MIN_DISTINCT_COLOR_DISTANCE) continue
		nextPalette.push(variant)
	}

	return nextPalette
}

export function extractTemplatePaletteFromPixels(pixels: Uint8ClampedArray) {
	const buckets = new Map<number, ColorBucket>()

	for (let index = 0; index + 3 < pixels.length; index += 4) {
		const alpha = pixels[index + 3] ?? 0
		if (alpha < MIN_ALPHA) continue

		const red = pixels[index] ?? 0
		const green = pixels[index + 1] ?? 0
		const blue = pixels[index + 2] ?? 0
		const bucketKey = ((red >> 3) << 10) | ((green >> 3) << 5) | (blue >> 3)
		const bucket = buckets.get(bucketKey) ?? {
			blueTotal: 0,
			count: 0,
			greenTotal: 0,
			redTotal: 0,
		}
		bucket.redTotal += red
		bucket.greenTotal += green
		bucket.blueTotal += blue
		bucket.count += 1
		buckets.set(bucketKey, bucket)
	}

	const candidates: PaletteCandidate[] = Array.from(buckets.values())
		.map((bucket) => ({
			count: bucket.count,
			hex: rgbToHex(
				bucket.redTotal / bucket.count,
				bucket.greenTotal / bucket.count,
				bucket.blueTotal / bucket.count,
			),
		}))
		.sort((left, right) => right.count - left.count)
		.slice(0, MAX_CANDIDATE_COLORS)

	const firstCandidate = candidates[0]
	if (!firstCandidate) return []

	const palette = [firstCandidate.hex]
	const remainingCandidates = candidates.slice(1)

	while (palette.length < MAX_PALETTE_COLORS && remainingCandidates.length > 0) {
		let bestCandidateIndex = -1
		let bestCandidateScore = Number.NEGATIVE_INFINITY

		remainingCandidates.forEach((candidate, index) => {
			const distance = getMinimumPaletteDistance(candidate.hex, palette)
			if (distance < MIN_DISTINCT_COLOR_DISTANCE) return

			// 颜色出现频率决定基础权重，感知距离用于避免色板被近似色占满。
			const score = Math.sqrt(candidate.count) * Math.min(distance, 0.4)
			if (score <= bestCandidateScore) return
			bestCandidateIndex = index
			bestCandidateScore = score
		})

		if (bestCandidateIndex < 0) break
		const [bestCandidate] = remainingCandidates.splice(bestCandidateIndex, 1)
		if (bestCandidate) palette.push(bestCandidate.hex)
	}

	return normalizeTemplateColors(ensureMinimumPaletteSize(palette))
}
