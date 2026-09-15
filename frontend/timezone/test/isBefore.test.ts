import { buildTimezoneSelectOptions, isCrossDay, normalizeMeetingTime } from "../src"

describe("business extensions", () => {
	it("checks cross-day correctly", () => {
		const crossed = isCrossDay({
			start: 1719241200,
			end: 1719252000,
			timezone: "Asia/Shanghai",
		})
		expect(typeof crossed).toBe("boolean")
	})

	it("builds options with preferred codes first", () => {
		const options = buildTimezoneSelectOptions({
			locale: "en_US",
			preferred: ["Asia/Shanghai", "Europe/London"],
		})
		expect(options.length).toBeGreaterThan(100)
		expect(options[0].value).toBe("Asia/Shanghai")
	})

	it("normalizes meeting time for organizer/viewer", () => {
		const result = normalizeMeetingTime({
			meetingTime: "2026-03-08 09:00:00",
			organizerTimezone: "Asia/Shanghai",
			viewerTimezone: "America/New_York",
		})
		expect(result.organizerText).toHaveLength(19)
		expect(result.viewerText).toHaveLength(19)
		expect(typeof result.viewerDateChanged).toBe("boolean")
	})
})
