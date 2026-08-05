import { describe, expect, it, vi } from "vitest"
import { fillRoute } from "../helpers"

vi.mock("@/routes/routes", () => ({
	registerRoutes: () => [],
}))

describe("fillRoute", () => {
	it("restores a wildcard share route with its matched splat", () => {
		expect(
			fillRoute("/share/*", {
				"*": "files/943535117533392896",
			}),
		).toBe("/share/files/943535117533392896")
	})

	it("removes an unmatched wildcard instead of leaving it in the URL", () => {
		expect(fillRoute("/share/*", {})).toBe("/share")
	})
})
