import { toTimestamp } from "../src"

describe("toTimestamp API", () => {
	it("returns seconds by default for number input", () => {
		expect(toTimestamp(1719190800)).toBe(1719190800)
	})

	it("returns milliseconds when unit is ms", () => {
		expect(toTimestamp(1719190800, { unit: "ms" })).toBe(1719190800000)
	})

	it("throws when timezone is invalid", () => {
		expect(() => toTimestamp("2024-06-25 00:00:00", { timezone: "Invalid/Timezone" })).toThrow(
			"unsupported timezone: Invalid/Timezone",
		)
	})

	it("throws when unit is unsupported", () => {
		expect(() =>
			toTimestamp("2024-06-25 00:00:00", {
				timezone: "Asia/Shanghai",
				unit: "minute" as never,
			}),
		).toThrow("unsupported unit: minute")
	})
})
