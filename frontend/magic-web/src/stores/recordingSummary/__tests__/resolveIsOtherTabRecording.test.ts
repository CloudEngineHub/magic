import { describe, expect, it } from "vitest"
import { resolveIsOtherTabRecording } from "../resolveIsOtherTabRecording"

describe("resolveIsOtherTabRecording", () => {
	it("returns false while the current tab is already recording", () => {
		expect(
			resolveIsOtherTabRecording({
				localStatus: "recording",
				tabStatus: "inactive",
				mirroredIsRecording: true,
			}),
		).toBe(false)
	})

	it("returns false after this tab becomes active again", () => {
		expect(
			resolveIsOtherTabRecording({
				localStatus: "init",
				tabStatus: "active",
				mirroredIsRecording: true,
			}),
		).toBe(false)
	})

	it("returns true only for mirrored recordings owned by another tab", () => {
		expect(
			resolveIsOtherTabRecording({
				localStatus: "init",
				tabStatus: "inactive",
				mirroredIsRecording: true,
			}),
		).toBe(true)
	})
})
