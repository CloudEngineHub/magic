import { describe, expect, it } from "vitest"
import {
	countActiveMobileAudioFilters,
	MOBILE_AUDIO_RECORDINGS_FILTER_DEFAULT,
	parseMobileSortOption,
} from "../types"

describe("mobile audio recordings filter types", () => {
	it("counts active secondary filters excluding default sort and all dates", () => {
		expect(countActiveMobileAudioFilters(MOBILE_AUDIO_RECORDINGS_FILTER_DEFAULT)).toBe(0)
		expect(
			countActiveMobileAudioFilters({
				datePreset: "week",
				sortOption: "updated_at_desc",
			}),
		).toBe(1)
		expect(
			countActiveMobileAudioFilters({
				datePreset: "all",
				sortOption: "created_at_desc",
			}),
		).toBe(1)
		expect(
			countActiveMobileAudioFilters({
				datePreset: "month",
				sortOption: "created_at_desc",
			}),
		).toBe(2)
	})

	it("parses mobile sort options into API params", () => {
		expect(parseMobileSortOption("updated_at_desc")).toEqual({
			sortBy: "updated_at",
			sortOrder: "desc",
		})
		expect(parseMobileSortOption("created_at_desc")).toEqual({
			sortBy: "created_at",
			sortOrder: "desc",
		})
	})
})
