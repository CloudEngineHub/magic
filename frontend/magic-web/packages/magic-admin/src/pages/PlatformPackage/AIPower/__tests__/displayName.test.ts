import { describe, expect, it } from "vitest"
import { stripSuperMagicBrand } from "../displayName"

describe("stripSuperMagicBrand", () => {
	it("removes the Chinese product name", () => {
		expect(stripSuperMagicBrand("超级麦吉深度写作")).toBe("深度写作")
		expect(stripSuperMagicBrand("深度写作（超级麦吉）")).toBe("深度写作")
	})

	it("removes the English product name and surrounding separators", () => {
		expect(stripSuperMagicBrand("Super Magic - Audio Analysis")).toBe("Audio Analysis")
	})

	it("handles empty values", () => {
		expect(stripSuperMagicBrand()).toBe("")
		expect(stripSuperMagicBrand(null)).toBe("")
	})
})
