import { describe, expect, it } from "vitest"
import { calculateFitScale } from "../useContentFitScale"

describe("calculateFitScale", () => {
	it("calculates the physical scale of a contained landscape image", () => {
		expect(
			calculateFitScale({
				intrinsicWidth: 2000,
				intrinsicHeight: 1000,
				layoutWidth: 1000,
				layoutHeight: 800,
				objectFit: "contain",
			}),
		).toBe(0.5)
	})

	it("uses the limiting axis for a contained portrait image", () => {
		expect(
			calculateFitScale({
				intrinsicWidth: 1000,
				intrinsicHeight: 2000,
				layoutWidth: 1000,
				layoutHeight: 800,
				objectFit: "contain",
			}),
		).toBe(0.4)
	})

	it("uses the covering axis for an image with object-fit cover", () => {
		expect(
			calculateFitScale({
				intrinsicWidth: 2000,
				intrinsicHeight: 1000,
				layoutWidth: 1000,
				layoutHeight: 800,
				objectFit: "cover",
			}),
		).toBe(0.8)
	})

	it("does not enlarge scale-down content beyond its original size", () => {
		expect(
			calculateFitScale({
				intrinsicWidth: 100,
				intrinsicHeight: 100,
				layoutWidth: 500,
				layoutHeight: 500,
				objectFit: "scale-down",
			}),
		).toBe(1)
	})

	it("falls back to 100% when dimensions are unavailable", () => {
		expect(
			calculateFitScale({
				intrinsicWidth: 0,
				intrinsicHeight: 0,
				layoutWidth: 1000,
				layoutHeight: 800,
				objectFit: "contain",
			}),
		).toBe(1)
	})
})
