import { assertSupportedFormat, assertTimeInput, assertTimezoneCode } from "../src/core/validate"

describe("core validate", () => {
	describe("assertTimeInput", () => {
		it("throws when input is null or undefined", () => {
			expect(() => assertTimeInput(undefined)).toThrow("input is required")
			expect(() => assertTimeInput(null, "time")).toThrow("time is required")
		})

		it("throws when number is not finite", () => {
			expect(() => assertTimeInput(Number.NaN, "time")).toThrow(
				"time must be a finite number",
			)
			expect(() => assertTimeInput(Number.POSITIVE_INFINITY, "time")).toThrow(
				"time must be a finite number",
			)
		})

		it("throws when string is empty", () => {
			expect(() => assertTimeInput("   ", "time")).toThrow("time cannot be an empty string")
		})

		it("throws when Date is invalid", () => {
			expect(() => assertTimeInput(new Date("invalid-date"), "time")).toThrow(
				"time is an invalid Date",
			)
		})

		it("throws when input type is unsupported", () => {
			expect(() => assertTimeInput({} as unknown, "time")).toThrow(
				"time must be string | number | Date",
			)
		})

		it("passes for valid number, string and date", () => {
			expect(() => assertTimeInput(1719190800, "time")).not.toThrow()
			expect(() => assertTimeInput("2026-03-08 10:00:00", "time")).not.toThrow()
			expect(() =>
				assertTimeInput(new Date("2026-03-08T10:00:00.000Z"), "time"),
			).not.toThrow()
		})
	})

	describe("assertSupportedFormat", () => {
		it("throws when format is empty", () => {
			expect(() => assertSupportedFormat("")).toThrow("format is required")
		})

		it("throws when format is unsupported", () => {
			expect(() => assertSupportedFormat("YYYY-DD-MM")).toThrow(
				"unsupported format: YYYY-DD-MM",
			)
		})

		it("passes for supported format", () => {
			expect(() => assertSupportedFormat("YYYY-MM-DD HH:mm:ss")).not.toThrow()
		})
	})

	describe("assertTimezoneCode", () => {
		it("throws when timezone is empty", () => {
			expect(() => assertTimezoneCode("")).toThrow("timezone is required")
		})

		it("throws when timezone is unsupported", () => {
			expect(() => assertTimezoneCode("Invalid/Timezone")).toThrow(
				"unsupported timezone: Invalid/Timezone",
			)
		})

		it("passes for supported timezone", () => {
			expect(() => assertTimezoneCode("Asia/Shanghai")).not.toThrow()
		})
	})
})
