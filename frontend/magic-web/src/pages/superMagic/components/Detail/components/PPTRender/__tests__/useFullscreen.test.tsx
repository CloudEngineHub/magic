import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useFullscreen } from "../hooks/useFullscreen"

const appEnv = vi.hoisted(() => ({
	isMagicApp: false,
}))

vi.mock("@/utils/devices", () => ({
	get isMagicApp() {
		return appEnv.isMagicApp
	},
}))

vi.mock("ahooks", () => ({
	useMemoizedFn: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}))

type FullscreenDocument = Document & {
	webkitFullscreenElement?: Element | null
	webkitExitFullscreen?: () => Promise<void>
}

type FullscreenElement = HTMLElement & {
	webkitRequestFullscreen?: () => Promise<void>
}

function defineFullscreenState(
	key: "fullscreenElement" | "webkitFullscreenElement",
	value: Element | null,
) {
	Object.defineProperty(document, key, {
		configurable: true,
		get: () => value,
	})
}

function renderFullscreenHook(container: FullscreenElement) {
	return renderHook(() => useFullscreen({ containerRef: { current: container } }))
}

describe("useFullscreen", () => {
	beforeEach(() => {
		appEnv.isMagicApp = false
		defineFullscreenState("fullscreenElement", null)
		defineFullscreenState("webkitFullscreenElement", null)
		delete (document as FullscreenDocument).webkitExitFullscreen
		vi.restoreAllMocks()
	})

	it("uses CSS fullscreen state in Magic App WebView without calling native fullscreen", async () => {
		appEnv.isMagicApp = true
		const lock = vi.fn(async () => undefined)
		Object.defineProperty(window.screen, "orientation", {
			configurable: true,
			value: { lock, unlock: vi.fn() },
		})
		const container = document.createElement("div") as FullscreenElement
		container.requestFullscreen = vi.fn(async () => undefined)

		const { result } = renderFullscreenHook(container)

		await act(async () => {
			await result.current.toggleFullscreen()
		})

		expect(container.requestFullscreen).not.toHaveBeenCalled()
		expect(result.current.isFullscreen).toBe(true)
		expect(lock).toHaveBeenCalledWith("landscape")

		await act(async () => {
			await result.current.exitFullscreen()
		})

		expect(result.current.isFullscreen).toBe(false)
	})

	it("keeps native fullscreen behavior in normal browsers", async () => {
		const container = document.createElement("div") as FullscreenElement
		container.requestFullscreen = vi.fn(async () => undefined)

		const { result } = renderFullscreenHook(container)

		await act(async () => {
			await result.current.toggleFullscreen()
		})

		expect(container.requestFullscreen).toHaveBeenCalledTimes(1)
		expect(result.current.isFullscreen).toBe(true)
	})

	it("syncs standard fullscreenchange events from the active container", () => {
		const container = document.createElement("div") as FullscreenElement
		const { result } = renderFullscreenHook(container)

		defineFullscreenState("fullscreenElement", container)

		act(() => {
			document.dispatchEvent(new Event("fullscreenchange"))
		})

		expect(result.current.isFullscreen).toBe(true)
	})

	it("syncs WebKit fullscreenchange events from the active container", () => {
		const container = document.createElement("div") as FullscreenElement
		const { result } = renderFullscreenHook(container)

		defineFullscreenState("webkitFullscreenElement", container)

		act(() => {
			document.dispatchEvent(new Event("webkitfullscreenchange"))
		})

		expect(result.current.isFullscreen).toBe(true)
	})

	it("falls back to CSS fullscreen and requests landscape when native API is unavailable", async () => {
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			value: () => ({ matches: true }),
		})
		const lock = vi.fn(async () => undefined)
		Object.defineProperty(window.screen, "orientation", {
			configurable: true,
			value: { lock, unlock: vi.fn() },
		})
		const container = document.createElement("div") as FullscreenElement
		const { result } = renderFullscreenHook(container)

		await act(async () => {
			await result.current.toggleFullscreen()
		})

		expect(result.current.isFullscreen).toBe(true)
		expect(lock).toHaveBeenCalledWith("landscape")
	})

	it("does not report desktop fullscreen when the native request is rejected", async () => {
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			value: () => ({ matches: false }),
		})
		const container = document.createElement("div") as FullscreenElement
		container.requestFullscreen = vi.fn(async () => {
			throw new Error("permission denied")
		})
		const { result } = renderFullscreenHook(container)

		await act(async () => {
			await result.current.toggleFullscreen()
		})

		expect(result.current.isFullscreen).toBe(false)
	})
})
