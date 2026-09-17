import { afterEach, describe, expect, it } from "vitest"
import { getBrowserInfo } from "../browser"

const originalUserAgent = navigator.userAgent

function setUserAgent(userAgent: string) {
	Object.defineProperty(navigator, "userAgent", {
		configurable: true,
		value: userAgent,
	})
}

afterEach(() => {
	setUserAgent(originalUserAgent)
})

describe("getBrowserInfo", () => {
	it("identifies Chromium Edge before the Chrome token", () => {
		setUserAgent(
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
				"Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0",
		)

		expect(getBrowserInfo()).toMatchObject({
			name: "Edge",
			version: 152,
			isOutdated: false,
		})
	})
})
