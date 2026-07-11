const TEMPLATE_COLOR_LIMIT = 5
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i
const PALETTE_COLOR_WEIGHTS = [0.5, 0.2, 0.12, 0.1, 0.08]

export const MAX_SIMILAR_TEMPLATE_COLOR_DISTANCE = 0.18

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

function getPaletteCoverageDistance(source: OklabColor[], target: OklabColor[]) {
	let weightedDistance = 0
	let totalWeight = 0

	source.forEach((sourceColor, index) => {
		const weight = PALETTE_COLOR_WEIGHTS[index] ?? 0
		const nearestDistance = Math.min(
			...target.map((targetColor) => getTemplateOklabDistance(sourceColor, targetColor)),
		)
		weightedDistance += nearestDistance * weight
		totalWeight += weight
	})

	return totalWeight > 0 ? weightedDistance / totalWeight : Number.POSITIVE_INFINITY
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
	const sourceCoverage = getPaletteCoverageDistance(sourcePalette, targetPalette)
	const targetCoverage = getPaletteCoverageDistance(targetPalette, sourcePalette)

	// 主色到候选色板的覆盖是主要判断，同时保留反向覆盖，避免只命中一个强调色。
	return sourceCoverage * 0.72 + targetCoverage * 0.28
}
