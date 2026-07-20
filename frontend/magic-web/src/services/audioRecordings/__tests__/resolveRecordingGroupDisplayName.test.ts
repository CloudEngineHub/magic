import { describe, expect, it } from "vitest"
import { resolveRecordingGroupDisplayName } from "@/services/audioRecordings/resolveRecordingGroupDisplayName"

describe("resolveRecordingGroupDisplayName", () => {
	const fallback = "Mock unnamed group"

	it("returns trimmed names when backend provides a non-empty value", () => {
		expect(resolveRecordingGroupDisplayName("  Mock group  ", fallback)).toBe("Mock group")
	})

	it("falls back when the backend name is empty or whitespace", () => {
		expect(resolveRecordingGroupDisplayName("", fallback)).toBe(fallback)
		expect(resolveRecordingGroupDisplayName("   ", fallback)).toBe(fallback)
		expect(resolveRecordingGroupDisplayName(null, fallback)).toBe(fallback)
		expect(resolveRecordingGroupDisplayName(undefined, fallback)).toBe(fallback)
	})
})
