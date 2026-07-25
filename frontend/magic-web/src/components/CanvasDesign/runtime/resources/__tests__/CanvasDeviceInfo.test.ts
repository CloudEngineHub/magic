import { afterEach, describe, expect, it, vi } from "vitest"
import { getDefaultCanvasDeviceInfo } from "../../shared/ids"

const originalInnerWidth = Object.getOwnPropertyDescriptor(window, "innerWidth")
const originalMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia")
const originalOntouchstart = Object.getOwnPropertyDescriptor(window, "ontouchstart")
const originalUserAgent = Object.getOwnPropertyDescriptor(navigator, "userAgent")
const originalMaxTouchPoints = Object.getOwnPropertyDescriptor(navigator, "maxTouchPoints")

function restoreProperty<T extends object>(
	target: T,
	key: keyof T,
	descriptor: PropertyDescriptor | undefined,
) {
	if (descriptor) {
		Object.defineProperty(target, key, descriptor)
	} else {
		Reflect.deleteProperty(target, key)
	}
}

function mockBrowserDevice(options: {
	userAgent: string
	width: number
	maxTouchPoints?: number
	ontouchstart?: boolean
	coarsePointer?: boolean
	hover?: boolean
}) {
	Object.defineProperty(window, "innerWidth", {
		configurable: true,
		value: options.width,
	})
	Object.defineProperty(navigator, "userAgent", {
		configurable: true,
		value: options.userAgent,
	})
	Object.defineProperty(navigator, "maxTouchPoints", {
		configurable: true,
		value: options.maxTouchPoints ?? 0,
	})

	if (options.ontouchstart) {
		Object.defineProperty(window, "ontouchstart", {
			configurable: true,
			value: null,
		})
	} else {
		Reflect.deleteProperty(window, "ontouchstart")
	}

	Object.defineProperty(window, "matchMedia", {
		configurable: true,
		value: vi.fn((query: string) => ({
			matches:
				query === "(pointer: coarse)"
					? (options.coarsePointer ?? false)
					: query === "(hover: hover)"
						? (options.hover ?? false)
						: false,
			media: query,
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
		})),
	})
}

describe("getDefaultCanvasDeviceInfo", () => {
	afterEach(() => {
		restoreProperty(window, "innerWidth", originalInnerWidth)
		restoreProperty(window, "matchMedia", originalMatchMedia)
		restoreProperty(window, "ontouchstart", originalOntouchstart)
		restoreProperty(navigator, "userAgent", originalUserAgent)
		restoreProperty(navigator, "maxTouchPoints", originalMaxTouchPoints)
		vi.restoreAllMocks()
	})

	it("detects a phone as compact touch input", () => {
		mockBrowserDevice({
			userAgent:
				"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
			width: 390,
			maxTouchPoints: 5,
			coarsePointer: true,
			hover: false,
		})

		expect(getDefaultCanvasDeviceInfo()).toEqual({
			formFactor: "phone",
			layout: "compact",
			input: {
				touch: true,
				coarsePointer: true,
				hover: false,
			},
		})
	})

	it("keeps a wide tablet in regular layout while preserving touch input", () => {
		mockBrowserDevice({
			userAgent:
				"Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
			width: 1024,
			maxTouchPoints: 5,
			coarsePointer: true,
			hover: false,
		})

		expect(getDefaultCanvasDeviceInfo()).toMatchObject({
			formFactor: "tablet",
			layout: "regular",
			input: {
				touch: true,
				coarsePointer: true,
				hover: false,
			},
		})
	})

	it("detects a touch PC as desktop regular layout with touch input", () => {
		mockBrowserDevice({
			userAgent:
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36",
			width: 1440,
			maxTouchPoints: 10,
			coarsePointer: false,
			hover: true,
		})

		expect(getDefaultCanvasDeviceInfo()).toMatchObject({
			formFactor: "desktop",
			layout: "regular",
			input: {
				touch: true,
				coarsePointer: false,
				hover: true,
			},
		})
	})

	it("detects a desktop without touch input", () => {
		mockBrowserDevice({
			userAgent:
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15",
			width: 1440,
			maxTouchPoints: 0,
			coarsePointer: false,
			hover: true,
		})

		expect(getDefaultCanvasDeviceInfo()).toMatchObject({
			formFactor: "desktop",
			layout: "regular",
			input: {
				touch: false,
				coarsePointer: false,
				hover: true,
			},
		})
	})
})
