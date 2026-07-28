import { getDayRange, getMonthRange } from "../src"

describe("range APIs", () => {
	it("returns today range in target timezone", () => {
		const [start, end] = getDayRange({
			timezone: "Asia/Shanghai",
			format: "YYYY-MM-DD HH:mm:ss",
		})
		expect(start.endsWith("00:00:00")).toBe(true)
		expect(end.endsWith("23:59:59")).toBe(true)
	})

	it("returns current month range in target timezone", () => {
		const [start, end] = getMonthRange({
			timezone: "Europe/London",
			format: "YYYY-MM-DD HH:mm:ss",
		})
		expect(typeof start).toBe("string")
		expect(typeof end).toBe("string")
		expect(start).toHaveLength(19)
		expect(end).toHaveLength(19)
	})

	it("supports number and string date inputs", () => {
		const [dayStart] = getDayRange({
			date: 1719190800,
			timezone: "Asia/Shanghai",
			format: "YYYY-MM-DD HH:mm:ss",
		})
		const [monthStart] = getMonthRange({
			date: "2026-03-08 10:00:00",
			timezone: "Asia/Shanghai",
			format: "YYYY-MM-DD HH:mm:ss",
		})
		expect(dayStart).toHaveLength(19)
		expect(monthStart).toHaveLength(19)
	})
})
