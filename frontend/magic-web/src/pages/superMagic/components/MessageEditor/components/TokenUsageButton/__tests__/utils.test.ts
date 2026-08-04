import { describe, expect, it } from "vitest"
import { formatTokenCount } from "../utils"

describe("formatTokenCount", () => {
	it.each([
		[0, "0"],
		[999, "999"],
		[1_000, "1K"],
		[256_000, "256K"],
	])("formats %i tokens as %s", (count, expected) => {
		expect(formatTokenCount(count)).toBe(expected)
	})

	it.each([
		[999_500, "1M"],
		[1_000_000, "1M"],
		[1_500_000, "1.5M"],
	])("formats million-scale token counts: %i -> %s", (count, expected) => {
		expect(formatTokenCount(count)).toBe(expected)
	})
})
