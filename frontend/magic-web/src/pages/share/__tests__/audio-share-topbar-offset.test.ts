import { describe, expect, it } from "vitest"
import {
	MOBILE_SHARE_TOPBAR_OFFSET,
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
