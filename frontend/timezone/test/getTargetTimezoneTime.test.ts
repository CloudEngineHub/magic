import { convertTime } from "../src"

describe("convertTime API", () => {
	it("throws error when non-number input misses from timezone", () => {
		expect(() =>
			convertTime("2024-06-25 00:00:00", {
				to: "Asia/Shanghai",
				format: "YYYY-MM-DD HH:mm:ss",
			}),
		).toThrow("`from` timezone is required for string/date input")
	})

	it("converts with explicit source timezone", () => {
		const result = convertTime("2024-06-25 00:00:00", {
			from: "Asia/Bangkok",
			to: "Asia/Shanghai",
			format: "YYYY-MM-DD HH:mm:ss",
		})
		expect(typeof result).toBe("string")
		expect(result).toHaveLength(19)
	})

	it("converts unix input without source timezone", () => {
		const result = convertTime(1719190800, {
			to: "Europe/London",
			format: "YYYY-MM-DD HH:mm:ss",
		})
		expect(typeof result).toBe("string")
		expect(result).toHaveLength(19)
	})

	it("throws for invalid target timezone", () => {
		expect(() =>
			convertTime(1719190800, {
				to: "Invalid/Timezone" as never,
				format: "YYYY-MM-DD HH:mm:ss",
			}),
		).toThrow("unsupported timezone: Invalid/Timezone")
	})

	it("throws when parsed source time is invalid", () => {
		expect(() =>
			convertTime("not-a-date", {
				from: "Asia/Shanghai",
				to: "Europe/London",
				format: "YYYY-MM-DD HH:mm:ss",
			}),
		).toThrow("input is invalid")
	})
})
