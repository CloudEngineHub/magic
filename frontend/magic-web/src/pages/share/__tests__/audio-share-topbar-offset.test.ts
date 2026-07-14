import { describe, expect, it } from "vitest"
import {
	MOBILE_AUDIO_SHARE_CREATED_BY_BADGE_BOTTOM,
	MOBILE_SHARE_TOPBAR_OFFSET,
	resolveMobileAudioShareCreatedByBadgeBottom,
	resolveMobileAudioShareTopbarOffset,
} from "../utils/audio-share-topbar-offset"

describe("resolveMobileAudioShareTopbarOffset", () => {
	it("returns the shared topbar offset for mobile audio share shells", () => {
		expect(
			resolveMobileAudioShareTopbarOffset({
				isMobile: true,
				shouldHideHeader: false,
				shouldRenderAudioShareShell: true,
			}),
		).toBe(MOBILE_SHARE_TOPBAR_OFFSET)
	})

	it("returns undefined when the outer header is hidden", () => {
		expect(
			resolveMobileAudioShareTopbarOffset({
				isMobile: true,
				shouldHideHeader: true,
				shouldRenderAudioShareShell: true,
			}),
		).toBeUndefined()
	})

	it("returns undefined for non-audio or desktop share shells", () => {
		expect(
			resolveMobileAudioShareTopbarOffset({
				isMobile: false,
				shouldHideHeader: false,
				shouldRenderAudioShareShell: true,
			}),
		).toBeUndefined()

		expect(
			resolveMobileAudioShareTopbarOffset({
				isMobile: true,
				shouldHideHeader: false,
				shouldRenderAudioShareShell: false,
			}),
		).toBeUndefined()
	})
})

describe("resolveMobileAudioShareCreatedByBadgeBottom", () => {
	it("returns the lifted badge offset for mobile audio share shells", () => {
		expect(
			resolveMobileAudioShareCreatedByBadgeBottom({
				defaultBottom: "12px",
				isMobile: true,
				shouldRenderAudioShareShell: true,
			}),
		).toBe(MOBILE_AUDIO_SHARE_CREATED_BY_BADGE_BOTTOM)
	})

	it("falls back to the default bottom outside the mobile audio share shell", () => {
		expect(
			resolveMobileAudioShareCreatedByBadgeBottom({
				defaultBottom: "12px",
				isMobile: false,
				shouldRenderAudioShareShell: true,
			}),
		).toBe("12px")

		expect(
			resolveMobileAudioShareCreatedByBadgeBottom({
				defaultBottom: "64px",
				isMobile: true,
				shouldRenderAudioShareShell: false,
			}),
		).toBe("64px")
	})
})
