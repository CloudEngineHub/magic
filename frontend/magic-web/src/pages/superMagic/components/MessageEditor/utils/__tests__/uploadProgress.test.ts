import { describe, expect, it } from "vitest"
import { normalizeUploadProgress, toDisplayUploadProgress } from "../uploadProgress"

describe("uploadProgress", () => {
	it("normalizes finite progress values into the supported range", () => {
		expect(normalizeUploadProgress(0)).toBe(0)
		expect(normalizeUploadProgress(42.4)).toBe(42.4)
		expect(normalizeUploadProgress(-1)).toBe(0)
		expect(normalizeUploadProgress(101)).toBe(100)
	})

	it("rejects non-finite and non-number values", () => {
		expect(normalizeUploadProgress(undefined)).toBeUndefined()
		expect(normalizeUploadProgress(Number.NaN)).toBeUndefined()
		expect(normalizeUploadProgress(Number.POSITIVE_INFINITY)).toBeUndefined()
		expect(normalizeUploadProgress("50")).toBeUndefined()
	})

	it("returns the integer value shared by progress UIs", () => {
		expect(toDisplayUploadProgress(42.4)).toBe(42)
		expect(toDisplayUploadProgress(42.5)).toBe(43)
		expect(toDisplayUploadProgress(100.9)).toBe(100)
	})
})
