import { describe, expect, it } from "vitest"
import { resolveFilterScope } from "../my-crew-mobile-shared"

describe("resolveFilterScope", () => {
	it.each([
		["all", "all"],
		["created", "created"],
		["fromMarket", "market_installed"],
	] as const)("maps %s to %s", (filterType, expectedScope) => {
		expect(resolveFilterScope(filterType)).toBe(expectedScope)
	})

	it("falls back to all for the removed team shared filter and invalid values", () => {
		expect(resolveFilterScope("teamShared")).toBe("all")
		expect(resolveFilterScope("unknown")).toBe("all")
		expect(resolveFilterScope(null)).toBe("all")
	})
})
