import { formatInTimezone } from "../src"

describe("formatInTimezone API", () => {
	it("formats unix timestamp in target timezone", () => {
		const text = formatInTimezone(1719244800, {
			timezone: "Asia/Shanghai",
			format: "YYYY-MM-DD HH:mm:ss",
		})
		expect(typeof text).toBe("string")
		expect(text).toHaveLength(19)
	})

	it("throws when timezone is invalid", () => {
		expect(() =>
			formatInTimezone(1719244800, {
				timezone: "Invalid/Timezone",
				format: "YYYY-MM-DD HH:mm:ss",
			}),
		).toThrow("unsupported timezone: Invalid/Timezone")
	})
})
