import { describe, expect, it } from "vitest"
import { extractTemplatePaletteFromPixels } from "../templateColorExtractionAlgorithm"

function createPixels(colors: Array<[red: number, green: number, blue: number, alpha?: number]>) {
	return new Uint8ClampedArray(
		colors.flatMap(([red, green, blue, alpha = 255]) => [red, green, blue, alpha]),
	)
}

describe("template color extraction algorithm", () => {
	it("keeps the dominant color first and returns a compact diverse palette", () => {
		const palette = extractTemplatePaletteFromPixels(
			createPixels([
				...[...Array(8)].map(() => [49, 94, 202] as const),
				...[...Array(3)].map(() => [122, 167, 255] as const),
				...[...Array(2)].map(() => [24, 42, 90] as const),
				[250, 250, 250],
			]),
		)

		expect(palette[0]).toBe("#315ECA")
		expect(palette.length).toBeGreaterThanOrEqual(3)
		expect(palette.length).toBeLessThanOrEqual(5)
		expect(new Set(palette).size).toBe(palette.length)
	})

	it("derives safe tonal variants for a nearly solid image", () => {
		const palette = extractTemplatePaletteFromPixels(
			createPixels([...Array(16)].map(() => [24, 42, 90] as const)),
		)

		expect(palette[0]).toBe("#182A5A")
		expect(palette).toHaveLength(3)
		expect(palette.every((color) => /^#[0-9A-F]{6}$/.test(color))).toBe(true)
	})

	it("ignores transparent pixels", () => {
		expect(
			extractTemplatePaletteFromPixels(
				createPixels([
					[255, 0, 0, 0],
					[0, 255, 0, 80],
				]),
			),
		).toEqual([])
	})
})
