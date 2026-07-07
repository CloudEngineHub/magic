import { describe, expect, it } from "vitest"
import { shouldHideRecordingFloatPanel } from "../float-panel-visibility-policy"

describe("shouldHideRecordingFloatPanel", () => {
	it("hides when panel is not visible", () => {
		expect(
			shouldHideRecordingFloatPanel({
				isVisible: false,
				isOnMobileRecordingsListRoute: false,
				isOnMobileRecordingDetailRoute: false,
			}),
		).toBe(true)
	})

	it("always hides on mobile recordings list route", () => {
		expect(
			shouldHideRecordingFloatPanel({
				isVisible: true,
				isOnMobileRecordingsListRoute: true,
				isOnMobileRecordingDetailRoute: false,
			}),
		).toBe(true)
	})

	it("always hides on mobile recording detail route", () => {
		expect(
			shouldHideRecordingFloatPanel({
				isVisible: true,
				isOnMobileRecordingsListRoute: false,
				isOnMobileRecordingDetailRoute: true,
			}),
		).toBe(true)
	})

	it("shows on other mobile pages so user can recover the active session", () => {
		expect(
			shouldHideRecordingFloatPanel({
				isVisible: true,
				isOnMobileRecordingsListRoute: false,
				isOnMobileRecordingDetailRoute: false,
			}),
		).toBe(false)
	})
})
