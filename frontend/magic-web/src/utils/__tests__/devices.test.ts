import { afterEach, describe, expect, it, vi } from "vitest"
import { shouldUseDesktopEnterBehavior } from "../devices"

const originalNavigator = globalThis.navigator

interface NavigatorMockOptions {
	userAgent: string
	platform: string
	maxTouchPoints?: number
	mobileHint?: boolean
}

/**
 * Replaces browser platform signals with synthetic values for device behavior tests.
 */
function mockNavigator({
	userAgent,
	platform,
	maxTouchPoints = 0,
	mobileHint,
}: NavigatorMockOptions) {
	vi.stubGlobal("navigator", {
		userAgent,
		platform,
		maxTouchPoints,
		userAgentData: mobileHint === undefined ? undefined : { mobile: mobileHint },
	})
}

afterEach(() => {
	vi.stubGlobal("navigator", originalNavigator)
})

describe("shouldUseDesktopEnterBehavior", () => {
	it.each([
		{
			name: "Windows desktop",
			userAgent:
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36",
			platform: "Win32",
		},
		{
			name: "macOS desktop",
			userAgent:
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
			platform: "MacIntel",
		},
		{
			name: "Linux desktop",
			userAgent:
				"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36",
			platform: "Linux x86_64",
		},
	])("enables desktop behavior for $name", ({ userAgent, platform }) => {
		mockNavigator({ userAgent, platform })

		expect(shouldUseDesktopEnterBehavior()).toBe(true)
	})

	it.each([
		{
			name: "iPhone browser",
			userAgent:
				"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
			platform: "iPhone",
			maxTouchPoints: 5,
		},
		{
			name: "Android tablet",
			userAgent:
				"Mozilla/5.0 (Linux; Android 15; TabletModel) AppleWebKit/537.36 Chrome/130.0 Safari/537.36",
			platform: "Linux armv8l",
			maxTouchPoints: 5,
		},
		{
			name: "iPadOS desktop user agent",
			userAgent:
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Safari/605.1.15",
			platform: "MacIntel",
			maxTouchPoints: 5,
		},
		{
			name: "Magic iOS WebView",
			userAgent:
				"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 magic-ios-2.0.0",
			platform: "iPhone",
			maxTouchPoints: 5,
		},
	])("retains mobile behavior for $name", ({ userAgent, platform, maxTouchPoints }) => {
		mockNavigator({ userAgent, platform, maxTouchPoints })

		expect(shouldUseDesktopEnterBehavior()).toBe(false)
	})

	it("retains mobile behavior when Chromium reports a mobile device", () => {
		mockNavigator({
			userAgent:
				"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36",
			platform: "Linux x86_64",
			mobileHint: true,
		})

		expect(shouldUseDesktopEnterBehavior()).toBe(false)
	})

	it("retains mobile behavior for unknown platforms", () => {
		mockNavigator({
			userAgent: "SyntheticBrowser/1.0",
			platform: "SyntheticPlatform",
		})

		expect(shouldUseDesktopEnterBehavior()).toBe(false)
	})
})
