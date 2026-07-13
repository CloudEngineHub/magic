const TEMPLATE_COLOR_LIMIT = 5
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i
const PALETTE_COLOR_WEIGHTS = [0.5, 0.2, 0.12, 0.1, 0.08]
const MAX_MATCHED_COLOR_DISTANCE = 0.11
const MAX_MATCHED_COLOR_HUE_DISTANCE_DEGREES = 60
const MIN_MATCHING_COLOR_COUNT = 2
const MIN_MATCHING_PALETTE_WEIGHT_RATIO = 0.6
const MIN_HUE_CHROMA = 0.025
const UNMATCHED_TEMPLATE_COLOR_DISTANCE = 0.18

export const MAX_SIMILAR_TEMPLATE_COLOR_DISTANCE = 0.13

export type OklabColor = [lightness: number, a: number, b: number]

export function normalizeTemplateColors(colors: string[] | null | undefined) {
	const normalizedColors = new Set<string>()

	for (const color of colors ?? []) {
		if (!HEX_COLOR_PATTERN.test(color)) continue
		normalizedColors.add(color.toUpperCase())
		if (normalizedColors.size >= TEMPLATE_COLOR_LIMIT) break
	}

	return Array.from(normalizedColors)
}

export function applyResolvedTemplateColors<T extends { colors?: string[] }>(
	template: T,
	resolvedColors: string[],
) {
	if (normalizeTemplateColors(template.colors).length > 0 || resolvedColors.length === 0) {
		return template
	}
	return { ...template, colors: resolvedColors }
}

export function templateColorToRgba(color: string | undefined, alpha: number) {
	const normalizedColor = normalizeTemplateColors(color ? [color] : [])[0]
	if (!normalizedColor) return undefined

	return `rgba(${Number.parseInt(normalizedColor.slice(1, 3), 16)}, ${Number.parseInt(
		normalizedColor.slice(3, 5),
		16,
	)}, ${Number.parseInt(normalizedColor.slice(5, 7), 16)}, ${Math.min(Math.max(alpha, 0), 1)})`
}

function srgbChannelToLinear(channel: number) {
	const normalizedChannel = channel / 255
	return normalizedChannel <= 0.04045
		? normalizedChannel / 12.92
		: Math.pow((normalizedChannel + 0.055) / 1.055, 2.4)
}

export function templateHexToOklab(color: string): OklabColor {
	const red = srgbChannelToLinear(Number.parseInt(color.slice(1, 3), 16))
	const green = srgbChannelToLinear(Number.parseInt(color.slice(3, 5), 16))
	const blue = srgbChannelToLinear(Number.parseInt(color.slice(5, 7), 16))
	const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue)
	const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue)
	const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue)

	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
	]
}

export function getTemplateOklabDistance(left: OklabColor, right: OklabColor) {
	return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2])
}

function getOklabChroma(color: OklabColor) {
	return Math.hypot(color[1], color[2])
}

function getOklabHue(color: OklabColor) {
	return (Math.atan2(color[2], color[1]) * 180) / Math.PI
}

function getHueDistance(left: OklabColor, right: OklabColor) {
	const difference = Math.abs(getOklabHue(left) - getOklabHue(right))
	return Math.min(difference, 360 - difference)
}

function areTemplateColorsSimilar(source: OklabColor, target: OklabColor) {
	if (getTemplateOklabDistance(source, target) > MAX_MATCHED_COLOR_DISTANCE) return false

	return (
		getOklabChroma(source) < MIN_HUE_CHROMA ||
		getOklabChroma(target) < MIN_HUE_CHROMA ||
		getHueDistance(source, target) <= MAX_MATCHED_COLOR_HUE_DISTANCE_DEGREES
	)
}

interface PaletteOverlap {
	matchedColorCount: number
	matchedWeight: number
	weightedDistance: number
}

function getColorWeight(index: number) {
	return PALETTE_COLOR_WEIGHTS[index] ?? 0
}

function isBetterPaletteOverlap(candidate: PaletteOverlap, current: PaletteOverlap) {
	if (candidate.matchedWeight !== current.matchedWeight) {
		return candidate.matchedWeight > current.matchedWeight
	}
	if (candidate.matchedColorCount !== current.matchedColorCount) {
		return candidate.matchedColorCount > current.matchedColorCount
	}
	return candidate.weightedDistance < current.weightedDistance
}

function getOptimalPaletteOverlap(source: OklabColor[], target: OklabColor[]) {
	const memo = new Map<string, PaletteOverlap>()

	function findBestOverlap(sourceIndex: number, targetMask: number): PaletteOverlap {
		if (sourceIndex >= source.length) {
			return { matchedColorCount: 0, matchedWeight: 0, weightedDistance: 0 }
		}

		const memoKey = `${sourceIndex}:${targetMask}`
		const cached = memo.get(memoKey)
		if (cached) return cached

		let bestOverlap = findBestOverlap(sourceIndex + 1, targetMask)
		const sourceColor = source[sourceIndex]
		const sourceWeight = getColorWeight(sourceIndex)
		if (sourceColor) {
			target.forEach((targetColor, targetIndex) => {
				if (targetMask & (1 << targetIndex)) return
				if (!areTemplateColorsSimilar(sourceColor, targetColor)) return

				const nextOverlap = findBestOverlap(
					sourceIndex + 1,
					targetMask | (1 << targetIndex),
				)
				const distance = getTemplateOklabDistance(sourceColor, targetColor)
				const candidateOverlap = {
					matchedColorCount: nextOverlap.matchedColorCount + 1,
					matchedWeight: nextOverlap.matchedWeight + sourceWeight,
					weightedDistance: nextOverlap.weightedDistance + distance * sourceWeight,
				}
				if (isBetterPaletteOverlap(candidateOverlap, bestOverlap)) {
					bestOverlap = candidateOverlap
				}
			})
		}

		memo.set(memoKey, bestOverlap)
		return bestOverlap
	}

	return findBestOverlap(0, 0)
}

function hasSufficientPaletteOverlap(source: OklabColor[], target: OklabColor[]) {
	const overlap = getOptimalPaletteOverlap(source, target)
	const totalWeight = source.reduce((sum, _, index) => sum + getColorWeight(index), 0)
	const requiredMatchCount = Math.min(MIN_MATCHING_COLOR_COUNT, source.length, target.length)
	return (
		overlap.matchedColorCount >= requiredMatchCount &&
		overlap.matchedWeight >= totalWeight * MIN_MATCHING_PALETTE_WEIGHT_RATIO
	)
}

function getOptimalPaletteDistance(source: OklabColor[], target: OklabColor[]) {
	const sourceCount = source.length
	const targetCount = target.length
	const matrixSize = sourceCount + targetCount
	const memo = new Map<string, number>()

	function getPairCost(sourceIndex: number, targetIndex: number) {
		const sourceColor = source[sourceIndex]
		const targetColor = target[targetIndex]
		if (sourceColor && targetColor) {
			return (
				getTemplateOklabDistance(sourceColor, targetColor) *
				(getColorWeight(sourceIndex) + getColorWeight(targetIndex))
			)
		}
		if (sourceColor) return UNMATCHED_TEMPLATE_COLOR_DISTANCE * getColorWeight(sourceIndex)
		if (targetColor) return UNMATCHED_TEMPLATE_COLOR_DISTANCE * getColorWeight(targetIndex)
		return 0
	}

	function findMinimumCost(rowIndex: number, targetMask: number): number {
		if (rowIndex >= matrixSize) return 0

		const memoKey = `${rowIndex}:${targetMask}`
		const cached = memo.get(memoKey)
		if (cached != null) return cached

		let minimumCost = Number.POSITIVE_INFINITY
		for (let targetIndex = 0; targetIndex < matrixSize; targetIndex += 1) {
			if (targetMask & (1 << targetIndex)) continue
			const cost =
				getPairCost(rowIndex, targetIndex) +
				findMinimumCost(rowIndex + 1, targetMask | (1 << targetIndex))
			if (cost < minimumCost) minimumCost = cost
		}

		memo.set(memoKey, minimumCost)
		return minimumCost
	}

	return findMinimumCost(0, 0) / 2
}

export function getTemplatePaletteDistance(
	sourceColors: string[] | null | undefined,
	targetColors: string[] | null | undefined,
) {
	const normalizedSourceColors = normalizeTemplateColors(sourceColors)
	const normalizedTargetColors = normalizeTemplateColors(targetColors)
	if (normalizedSourceColors.length === 0 || normalizedTargetColors.length === 0) {
		return Number.POSITIVE_INFINITY
	}

	const sourcePalette = normalizedSourceColors.map(templateHexToOklab)
	const targetPalette = normalizedTargetColors.map(templateHexToOklab)
	if (!hasSufficientPaletteOverlap(sourcePalette, targetPalette)) {
		return Number.POSITIVE_INFINITY
	}

	// 全局一对一分配会同时处理颜色顺序和未匹配颜色，避免局部最近色导致错误配对。
	return getOptimalPaletteDistance(sourcePalette, targetPalette)
}
