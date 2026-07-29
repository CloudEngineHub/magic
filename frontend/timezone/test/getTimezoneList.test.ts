import { getTimezone, getTimezones } from "../src"

describe("catalog APIs", () => {
	it("returns timezone list with expected fields", () => {
		const list = getTimezones({ locale: "en_US" })
		expect(Array.isArray(list)).toBe(true)
		expect(list.length).toBeGreaterThan(100)
		expect(list[0]).toHaveProperty("code")
		expect(list[0]).toHaveProperty("offset")
		expect(list[0]).toHaveProperty("offsetMinutes")
		expect(list[0]).toHaveProperty("label")
	})

	it("supports keyword search", () => {
		const list = getTimezones({ keyword: "shanghai", locale: "en_US" })
		expect(list.some((item) => item.code === "Asia/Shanghai")).toBe(true)
	})

	it("gets a single timezone by code", () => {
		const tz = getTimezone("Asia/Shanghai", "zh_CN")
		expect(tz?.code).toBe("Asia/Shanghai")
		expect(typeof tz?.label).toBe("string")
	})

	it("supports grouping and returns undefined for unknown code", () => {
		const grouped = getTimezones({ locale: "en_US", groupByOffset: true })
		expect(grouped[0].group).toBeDefined()
		expect(getTimezone("Invalid/Timezone", "en_US")).toBeUndefined()
	})
})
