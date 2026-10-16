import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest"

/**
 * Early pre-check script served from `public/`. Keep this file name in sync with the
 * `<script src="/browser-compat.vN.js">` reference in the edition `index.html` files.
 */
const precheckScript = readFileSync(resolve(process.cwd(), "public/browser-compat.v2.js"), "utf8")

const MODAL_SELECTOR = "#__browser_compat_modal__"
const CONTINUE_BUTTON_SELECTOR = "#__btn_browser_continue__"
const SUPPRESS_CHECKBOX_SELECTOR = "#__chk_browser_14d__"
const SUPPRESSED_UNTIL_KEY = "MAGIC_BROWSER_WARN_SUPPRESSED_UNTIL"

const originalAddEventListener = document.addEventListener.bind(document)
const ORIGINAL_USER_AGENT = navigator.userAgent

/** Listeners the script registers for `DOMContentLoaded`. */
let domContentLoadedListeners: Array<() => void> = []
let addEventListenerSpy: MockInstance

function setUserAgent(userAgent: string) {
	Object.defineProperty(navigator, "userAgent", {
		configurable: true,
		value: userAgent,
	})
}

function setOutdatedUserAgent() {
	setUserAgent(
		"Mozilla/5.0 (Linux; Android 12; SM-G975F) AppleWebKit/537.36 " +
			"(KHTML, like Gecko) Chrome/100.0.4896.58 Mobile Safari/537.36",
	)
}

/** Removes the overlay and the suppression state so every test starts from a clean page. */
function resetPageState() {
	document.querySelectorAll(MODAL_SELECTOR).forEach((element) => element.remove())
	window.localStorage.clear()
	window.sessionStorage.clear()
}

/**
 * Evaluates the pre-check script the way the browser does, with the document still
 * parsing so the script registers its `DOMContentLoaded` listener.
 */
function runPrecheckScript() {
	const readyStateDescriptor = Object.getOwnPropertyDescriptor(document, "readyState")
	Object.defineProperty(document, "readyState", { configurable: true, get: () => "loading" })

	try {
		new Function(precheckScript)()
	} finally {
		if (readyStateDescriptor) {
			Object.defineProperty(document, "readyState", readyStateDescriptor)
		} else {
			delete (document as unknown as Record<string, unknown>).readyState
		}
	}
}

/**
 * Delivers `DOMContentLoaded` to the listeners registered by the last script evaluation.
 * Legacy browsers load es-module-shims in shim mode, which re-dispatches the event before
 * the browser delivers its own, so the same listener receives it twice.
 */
function deliverDomContentLoaded(dispatches = 1) {
	for (let dispatch = 0; dispatch < dispatches; dispatch += 1) {
		domContentLoadedListeners.forEach((listener) => listener())
	}
}

function continueButton() {
	return document.querySelector<HTMLButtonElement>(CONTINUE_BUTTON_SELECTOR)
}

beforeEach(() => {
	setOutdatedUserAgent()
	resetPageState()
	domContentLoadedListeners = []
	// Capture ready-callbacks instead of dispatching on the shared document, so an earlier
	// evaluation cannot deliver events into a later test.
	addEventListenerSpy = vi.spyOn(document, "addEventListener").mockImplementation(((
		type: string,
		listener: EventListenerOrEventListenerObject | null,
		options?: boolean | AddEventListenerOptions,
	) => {
		if (type === "DOMContentLoaded" && typeof listener === "function") {
			domContentLoadedListeners.push(listener as () => void)
			return
		}
		originalAddEventListener(type, listener as EventListener, options)
	}) as typeof document.addEventListener)
})

afterEach(() => {
	addEventListenerSpy.mockRestore()
	resetPageState()
	setUserAgent(ORIGINAL_USER_AGENT)
})

describe("browser compatibility pre-check script", () => {
	it("renders a single, dismissible warning when DOMContentLoaded is delivered twice", () => {
		runPrecheckScript()
		deliverDomContentLoaded(2)

		expect(document.querySelectorAll(MODAL_SELECTOR)).toHaveLength(1)

		// The visible overlay must own the handler: clicking it dismisses the warning.
		continueButton()?.click()

		expect(document.querySelector(MODAL_SELECTOR)).toBeNull()
		expect(window.sessionStorage.length).toBeGreaterThan(0)
	})

	it("keeps the warning dismissed when DOMContentLoaded arrives again", () => {
		runPrecheckScript()
		deliverDomContentLoaded(2)

		continueButton()?.click()
		deliverDomContentLoaded(1)

		expect(document.querySelector(MODAL_SELECTOR)).toBeNull()
	})

	it("reads the 14-day suppression checkbox of its own overlay", () => {
		runPrecheckScript()
		deliverDomContentLoaded(1)

		const checkbox = document.querySelector<HTMLInputElement>(SUPPRESS_CHECKBOX_SELECTOR)
		expect(checkbox).not.toBeNull()
		if (checkbox) checkbox.checked = true

		continueButton()?.click()

		expect(Number(window.localStorage.getItem(SUPPRESSED_UNTIL_KEY))).toBeGreaterThan(
			Date.now(),
		)
		expect(document.querySelector(MODAL_SELECTOR)).toBeNull()
	})

	it("does not render the warning for a supported browser", () => {
		setUserAgent(
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
				"(KHTML, like Gecko) Chrome/111.0.5563.64 Safari/537.36",
		)

		runPrecheckScript()
		deliverDomContentLoaded(2)

		expect(document.querySelector(MODAL_SELECTOR)).toBeNull()
	})
})
