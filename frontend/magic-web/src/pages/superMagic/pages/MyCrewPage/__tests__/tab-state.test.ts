import { describe, expect, it } from "vitest"
import { getMyCrewAvailableTabs, normalizeMyCrewTabValue } from "../tab-state"

describe("My Crew tab state", () => {
	it("exposes only created and hired tabs", () => {
		expect(getMyCrewAvailableTabs()).toEqual(["created", "hired"])
	})

	it.each(["team-shared", "unknown", "", null, undefined])(
		"falls back to created for removed or invalid tab %s",
		(tab) => {
			expect(normalizeMyCrewTabValue(tab)).toBe("created")
		},
	)
})
