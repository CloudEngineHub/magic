import { describe, expect, it } from "vitest"
import { hashSpeakerId, resolveSpeakerChipStyle } from "../resolve-speaker-chip-style"

describe("resolveSpeakerChipStyle", () => {
	it("maps Speaker-N ids to palette order", () => {
		expect(resolveSpeakerChipStyle("Speaker-1").chip).toContain("blue")
		expect(resolveSpeakerChipStyle("Speaker-2").chip).toContain("orange")
		expect(resolveSpeakerChipStyle("Speaker-3").chip).toContain("emerald")
	})

	it("hashes non-standard speaker ids deterministically", () => {
		const speakerId = "Guest-Alpha"
		expect(resolveSpeakerChipStyle(speakerId)).toEqual(resolveSpeakerChipStyle(speakerId))
		expect(hashSpeakerId(speakerId)).toBeGreaterThanOrEqual(0)
	})
})
