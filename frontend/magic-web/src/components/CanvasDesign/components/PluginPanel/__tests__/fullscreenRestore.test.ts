import { afterEach, describe, expect, it, vi } from "vitest"

import { captureFullscreenRestoreTarget, restoreFullscreenIfNeeded } from "../fullscreenRestore"

function defineFullscreenElement(value: Element | null) {
	Object.defineProperty(document, "fullscreenElement", {
		configurable: true,
		get: () => value,
	})
}

describe("fullscreenRestore", () => {
	afterEach(() => {
		defineFullscreenElement(null)
		vi.restoreAllMocks()
	})

	it("captures the current fullscreen element", () => {
		const element = document.createElement("div")
		defineFullscreenElement(element)

		expect(captureFullscreenRestoreTarget()).toBe(element)
	})

	it("restores fullscreen when a target was captured and fullscreen is inactive", async () => {
		const element = document.createElement("div")
		const requestFullscreen = vi.fn().mockResolvedValue(undefined)
		element.requestFullscreen = requestFullscreen
		defineFullscreenElement(null)

		await restoreFullscreenIfNeeded(element)

		expect(requestFullscreen).toHaveBeenCalledTimes(1)
	})

	it("does nothing when fullscreen is already active", async () => {
		const element = document.createElement("div")
		element.requestFullscreen = vi.fn().mockResolvedValue(undefined)
		defineFullscreenElement(element)

		await restoreFullscreenIfNeeded(element)

		expect(element.requestFullscreen).not.toHaveBeenCalled()
	})

	it("does nothing when no restore target was captured", async () => {
		defineFullscreenElement(null)

		await restoreFullscreenIfNeeded(null)

		expect(document.fullscreenElement).toBeNull()
	})
})
