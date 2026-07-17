import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { resolveDatePresetRange } from "../resolve-date-preset-range"

describe("resolveDatePresetRange", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date("2026-06-22T15:30:00"))
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("returns empty range for all-time preset", () => {
		expect(resolveDatePresetRange("all")).toEqual({})
	})

	it("returns today start/end for today preset", () => {
		const range = resolveDatePresetRange("today")

		expect(range.start).toBe(Math.floor(new Date("2026-06-22T00:00:00").getTime() / 1000))
		expect(range.end).toBe(Math.floor(new Date("2026-06-22T23:59:59.999").getTime() / 1000))
	})

	it("returns last 7 days inclusive for week preset", () => {
		const range = resolveDatePresetRange("week")

		expect(range.start).toBe(Math.floor(new Date("2026-06-16T00:00:00").getTime() / 1000))
		expect(range.end).toBe(Math.floor(new Date("2026-06-22T23:59:59.999").getTime() / 1000))
	})

	it("returns last 30 days for month preset", () => {
		const range = resolveDatePresetRange("month")

		expect(range.start).toBe(Math.floor(new Date("2026-05-24T00:00:00").getTime() / 1000))
		expect(range.end).toBe(Math.floor(new Date("2026-06-22T23:59:59.999").getTime() / 1000))
	})
})
