import { describe, expect, it } from "vitest"
import { generateUniqueDesignFileName } from "../utils"

describe("generateUniqueDesignFileName", () => {
	it("keeps an unused file name", () => {
		expect(generateUniqueDesignFileName("a.png", new Set(["b.png"]))).toBe("a.png")
	})

	it("uses the first available numbered name after one scan", () => {
		expect(generateUniqueDesignFileName("a.png", new Set(["a.png", "a(2).png"]))).toBe(
			"a(1).png",
		)
	})

	it("matches the backend rule for an already numbered source name", () => {
		expect(generateUniqueDesignFileName("a(1).png", new Set(["a(1).png", "a(1)(2).png"]))).toBe(
			"a(1)(1).png",
		)
	})

	it("ignores numbered names belonging to another base name", () => {
		expect(generateUniqueDesignFileName("a.png", new Set(["a.png", "ab(1).png"]))).toBe(
			"a(1).png",
		)
	})
})
