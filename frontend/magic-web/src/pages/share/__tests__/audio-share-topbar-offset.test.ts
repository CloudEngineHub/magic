import { describe, expect, it } from "vitest"
import {
	MOBILE_AUDIO_SHARE_CREATED_BY_BADGE_BOTTOM,
	resolveMobileAudioShareCreatedByBadgeBottom,
} from "../utils/audio-share-topbar-offset"

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
