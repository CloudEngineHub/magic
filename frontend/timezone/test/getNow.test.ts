import dayjs from "dayjs"
import { now } from "../src"

describe("now API", () => {
	it("throws error for unsupported format", () => {
		expect(() => now({ format: "invalid-format", timezone: "Asia/Shanghai" })).toThrow(
			"unsupported format: invalid-format",
		)
	})

	it("returns correctly formatted time in target timezone", () => {
		const format = "YYYY-MM-DD HH:mm:ss"
		const result = now({ format, timezone: "Asia/Shanghai" })
		expect(dayjs(result).isValid()).toBe(true)
		expect(result).toHaveLength(19)
	})
})
