import { describe, expect, it } from "vitest"
import { normalizeFieldCustomInputValue } from "../fieldCustomInput"

describe("normalizeFieldCustomInputValue", () => {
	it("validates integer values against the configured range and step", () => {
		const config = { type: "number" as const, min: 1, step: 2, integer: true }

		expect(normalizeFieldCustomInputValue("5", config)).toBe("5")
		expect(normalizeFieldCustomInputValue("4", config)).toBeNull()
		expect(normalizeFieldCustomInputValue("1.5", config)).toBeNull()
	})

	it("supports decimal values when integer mode is disabled", () => {
		const config = { type: "number" as const, min: 0, step: 0.5 }

		expect(normalizeFieldCustomInputValue("1.5", config)).toBe("1.5")
		expect(normalizeFieldCustomInputValue("1.2", config)).toBeNull()
	})
})
