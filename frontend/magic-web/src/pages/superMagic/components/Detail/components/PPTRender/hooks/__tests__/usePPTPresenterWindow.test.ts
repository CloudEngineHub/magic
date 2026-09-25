import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { usePPTPresenterWindow } from "../usePPTPresenterWindow"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, options?: { page?: number }) => {
			if (key === "ppt.presenter.slideTitle") return `Slide ${options?.page} · Presenter`
			return {
				"ppt.presenter.title": "Presenter",
				"ppt.presenter.frameTitle": "PPT presentation",
				"ppt.presenter.enterFullscreen": "Enter fullscreen",
			}[key]
		},
	}),
}))

type WindowWithManagement = Window & {
	getScreenDetails?: () => Promise<{
		currentScreen: object
		screens: object[]
	}>
}

const currentScreen = {
	left: 0,
	top: 0,
	width: 1440,
	height: 900,
	availLeft: 0,
	availTop: 24,
	availWidth: 1440,
	availHeight: 876,
	isPrimary: true,
	label: "Built-in display",
}
const externalScreen = {
	left: 1440,
	top: 0,
	width: 1920,
	height: 1080,
	availLeft: 1440,
	availTop: 0,
	availWidth: 1920,
	availHeight: 1040,
	isPrimary: false,
	label: "Projector",
}

function createPopup() {
	const frame = document.createElement("iframe")
	const fullscreenButton = document.createElement("button")
	const documentListeners = new Map<string, EventListener>()
	const windowListeners = new Map<string, EventListener>()
	return {
		closed: false,
		innerWidth: 1280,
		innerHeight: 800,
		document: {
			title: "",
			open: vi.fn(),
			write: vi.fn(),
			close: vi.fn(),
			documentElement: { requestFullscreen: vi.fn(async () => undefined) },
			getElementById: vi.fn((id: string) =>
				id === "ppt-presenter-frame" ? frame : fullscreenButton,
			),
			addEventListener: vi.fn((type: string, listener: EventListener) => {
				documentListeners.set(type, listener)
			}),
			removeEventListener: vi.fn((type: string) => {
				documentListeners.delete(type)
			}),
		},
		postMessage: vi.fn(),
		focus: vi.fn(),
		moveTo: vi.fn(),
		resizeTo: vi.fn(),
		close: vi.fn(),
		addEventListener: vi.fn((type: string, listener: EventListener) => {
			windowListeners.set(type, listener)
		}),
		removeEventListener: vi.fn((type: string) => {
			windowListeners.delete(type)
		}),
		__frame: frame,
		__fullscreenButton: fullscreenButton,
		__documentListeners: documentListeners,
		__windowListeners: windowListeners,
	} as unknown as Window & {
		__frame: HTMLIFrameElement
		__fullscreenButton: HTMLButtonElement
		__documentListeners: Map<string, EventListener>
		__windowListeners: Map<string, EventListener>
	}
}

function createDeferred<T>() {
	let resolve!: (value: T) => void
	const promise = new Promise<T>((nextResolve) => {
		resolve = nextResolve
	})
	return { promise, resolve }
}

describe("usePPTPresenterWindow", () => {
	beforeEach(() => {
		Object.defineProperty(window.screen, "isExtended", { configurable: true, value: true })
		vi.spyOn(window, "focus").mockImplementation(() => undefined)
		;(window as WindowWithManagement).getScreenDetails = vi.fn(async () => ({
			currentScreen,
			screens: [currentScreen, externalScreen],
		}))
	})

	afterEach(() => {
		delete (window as WindowWithManagement).getScreenDetails
		Reflect.deleteProperty(window.screen, "isExtended")
		vi.restoreAllMocks()
	})

	it.each([false, undefined])(
		"preserves first-click fullscreen activation when isExtended is %s",
		async (isExtended) => {
			Object.defineProperty(window.screen, "isExtended", {
				configurable: true,
				value: isExtended,
			})
			let activationAvailable = true
			const popup = createPopup()
			const openWindow = vi.spyOn(window, "open").mockImplementation(() => {
				activationAvailable = false
				return popup
			})
			const getScreenDetails = vi.fn(async () => ({
				currentScreen,
				screens: [currentScreen],
			}))
			;(window as WindowWithManagement).getScreenDetails = getScreenDetails
			const { result } = renderHook(() => usePPTPresenterWindow())
			await act(async () => {
				expect(await result.current.open({ index: 0, html: "<main>Slide</main>" })).toBe(
					"fallback",
				)
				// The caller requests native fullscreen immediately on this fallback.
				expect(activationAvailable).toBe(true)
			})
			expect(openWindow).not.toHaveBeenCalled()
			expect(getScreenDetails).not.toHaveBeenCalled()
			expect(result.current.isOpen).toBe(false)
			expect(result.current.isFallbackOnly).toBe(false)
		},
	)

	it("can open a presenter after an external display is connected", async () => {
		Object.defineProperty(window.screen, "isExtended", { configurable: true, value: false })
		const openWindow = vi.spyOn(window, "open").mockReturnValue(createPopup())
		const { result } = renderHook(() => usePPTPresenterWindow())
		await act(async () => {
			expect(await result.current.open({ index: 0, html: "Slide" })).toBe("fallback")
		})
		expect(openWindow).not.toHaveBeenCalled()
		Object.defineProperty(window.screen, "isExtended", { configurable: true, value: true })
		await act(async () => {
			expect(await result.current.open({ index: 0, html: "Slide" })).toBe("opened")
		})
		expect(openWindow).toHaveBeenCalledTimes(1)
	})

	it("opens synchronously, writes a fixed shell, and posts structured slide data", async () => {
		const popup = createPopup()
		vi.spyOn(window, "open").mockReturnValue(popup)
		const { result } = renderHook(() => usePPTPresenterWindow())

		let openPromise!: Promise<"opened" | "fallback" | "cancelled">
		act(() => {
			openPromise = result.current.open({
				index: 2,
				html: "<script>alert(1)</script><main>Slide</main>",
			})
		})
		expect(window.open).toHaveBeenCalledTimes(1)
		await act(async () => expect(await openPromise).toBe("opened"))

		expect(popup.document.write).toHaveBeenCalledWith(
			expect.stringContaining('id="ppt-presenter-root"'),
		)
		expect(popup.document.write).toHaveBeenCalledWith(
			expect.stringContaining('sandbox="allow-scripts"'),
		)
		expect(popup.document.write).not.toHaveBeenCalledWith(expect.stringContaining("<script"))
		expect(popup.document.write).not.toHaveBeenCalledWith(expect.stringContaining("Presenter"))
		expect(popup.document.write).not.toHaveBeenCalledWith(
			expect.stringContaining("Enter fullscreen"),
		)
		expect(popup.document.write).not.toHaveBeenCalledWith(expect.stringContaining("alert(1)"))
		expect(popup.document.title).toBe("Presenter")
		expect(popup.__frame.title).toBe("PPT presentation")
		expect(popup.__fullscreenButton).toHaveTextContent("Enter fullscreen")
		expect(window.focus).toHaveBeenCalledOnce()
		expect(popup.focus).not.toHaveBeenCalled()
		expect(popup.postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "ppt-presenter:slide",
				payload: expect.objectContaining({
					index: 2,
					html: expect.stringContaining("Slide"),
				}),
			}),
			window.location.origin,
		)

		const messageHandler = (popup.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
			([type]) => type === "message",
		)?.[1] as (event: MessageEvent) => void
		messageHandler({
			origin: window.location.origin,
			source: window,
			data: { type: "ppt-presenter:slide", payload: { index: 3, html: "<main>Next</main>" } },
		} as MessageEvent)
		expect(popup.__frame.srcdoc).toBe("<main>Next</main>")
		expect(popup.document.title).toBe("Slide 4 · Presenter")
	})

	it("lists displays and moves the presenter to selected available bounds", async () => {
		const popup = createPopup()
		vi.spyOn(window, "open").mockReturnValue(popup)
		const { result } = renderHook(() => usePPTPresenterWindow())

		await act(async () => {
			await result.current.open({ index: 0, html: "<main>Slide</main>" })
		})

		expect(result.current.screens).toEqual([currentScreen, externalScreen])
		expect(popup.moveTo).toHaveBeenCalledWith(1440, 0)
		expect(popup.resizeTo).toHaveBeenCalledWith(1920, 1040)
		expect(popup.document.documentElement.requestFullscreen).toHaveBeenCalledWith({
			screen: externalScreen,
		})
		expect(popup.__fullscreenButton.hidden).toBe(true)

		const exitFullscreen = vi.fn(async () => undefined)
		Object.assign(popup.document, { fullscreenElement: {}, exitFullscreen })
		;(popup.moveTo as ReturnType<typeof vi.fn>).mockClear()
		;(popup.resizeTo as ReturnType<typeof vi.fn>).mockClear()
		;(popup.document.documentElement.requestFullscreen as ReturnType<typeof vi.fn>).mockClear()
		await act(async () => expect(await result.current.moveToScreen(0)).toBe(true))
		expect(popup.moveTo).toHaveBeenLastCalledWith(0, 24)
		expect(popup.resizeTo).toHaveBeenLastCalledWith(1440, 876)
		expect(exitFullscreen).toHaveBeenCalledTimes(1)
		expect(exitFullscreen.mock.invocationCallOrder[0]).toBeLessThan(
			(popup.moveTo as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0],
		)
		expect(popup.document.documentElement.requestFullscreen).not.toHaveBeenCalled()
		expect(popup.__fullscreenButton.hidden).toBe(false)
		expect(result.current.selectedScreen).toBe(0)
	})

	it("contains the canonical slide canvas and recalculates on popup resize", async () => {
		const popup = createPopup()
		Object.assign(popup, { innerWidth: 1280, innerHeight: 800 })
		vi.spyOn(window, "open").mockReturnValue(popup)
		const { result } = renderHook(() => usePPTPresenterWindow())

		await act(async () => {
			await result.current.open({
				index: 0,
				html: "<main>Slide</main>",
				dimensions: { width: 1920, height: 1080 },
			})
		})

		expect(popup.__frame.style.width).toBe("1920px")
		expect(popup.__frame.style.height).toBe("1080px")
		expect(popup.__frame.style.transform).toBe("translate(0px, 40px) scale(0.6666666666666666)")

		Object.assign(popup, { innerWidth: 1000, innerHeight: 700 })
		act(() => popup.__windowListeners.get("resize")?.(new Event("resize")))

		expect(popup.__frame.style.transform).toBe(
			"translate(0px, 68.75px) scale(0.5208333333333334)",
		)
		act(() => result.current.close())
		expect(popup.__windowListeners.has("resize")).toBe(false)
	})

	it("enters fullscreen from the popup CTA and tracks fullscreen changes", async () => {
		const popup = createPopup()
		const requestFullscreen = popup.document.documentElement.requestFullscreen as ReturnType<
			typeof vi.fn
		>
		requestFullscreen.mockRejectedValueOnce(new Error("activation expired"))
		vi.spyOn(window, "open").mockReturnValue(popup)
		const { result } = renderHook(() => usePPTPresenterWindow())

		await act(async () => {
			await result.current.open({ index: 0, html: "<main>Slide</main>" })
		})
		expect(popup.__fullscreenButton.hidden).toBe(false)

		requestFullscreen.mockResolvedValueOnce(undefined)
		await act(async () => {
			popup.__fullscreenButton.click()
			await Promise.resolve()
		})
		expect(requestFullscreen).toHaveBeenLastCalledWith()
		expect(popup.__fullscreenButton.hidden).toBe(true)

		Object.assign(popup.document, { fullscreenElement: {} })
		act(() =>
			popup.__documentListeners.get("fullscreenchange")?.(new Event("fullscreenchange")),
		)
		expect(popup.__fullscreenButton.hidden).toBe(true)
		Object.assign(popup.document, { fullscreenElement: null })
		act(() =>
			popup.__documentListeners.get("fullscreenchange")?.(new Event("fullscreenchange")),
		)
		expect(popup.__fullscreenButton.hidden).toBe(false)
	})

	it("uses a unique popup name for each presenter hook instance", async () => {
		const firstPopup = createPopup()
		const secondPopup = createPopup()
		const open = vi
			.spyOn(window, "open")
			.mockReturnValueOnce(firstPopup)
			.mockReturnValueOnce(secondPopup)
		const first = renderHook(() => usePPTPresenterWindow())
		const second = renderHook(() => usePPTPresenterWindow())

		await act(async () => {
			await first.result.current.open({ index: 0, html: "<main>First</main>" })
			await second.result.current.open({ index: 0, html: "<main>Second</main>" })
		})

		expect(open.mock.calls[0][1]).not.toBe(open.mock.calls[1][1])
		first.unmount()
		second.unmount()
	})

	it("keeps the positioned popup when targeted fullscreen is rejected", async () => {
		const popup = createPopup()
		;(
			popup.document.documentElement.requestFullscreen as ReturnType<typeof vi.fn>
		).mockRejectedValue(new Error("denied"))
		vi.spyOn(window, "open").mockReturnValue(popup)
		const { result } = renderHook(() => usePPTPresenterWindow())

		await act(async () => {
			expect(await result.current.open({ index: 0, html: "<main>Slide</main>" })).toBe(
				"opened",
			)
		})

		expect(result.current.isOpen).toBe(true)
		expect(popup.resizeTo).toHaveBeenCalled()
		expect(popup.__fullscreenButton.hidden).toBe(false)
	})

	it.each([
		"unsupported",
		"blocked",
		"permission denied",
		"single display",
		"duplicate current display",
	])("returns fallback when window management is %s", async (failure) => {
		const popup = createPopup()
		const windowOpen = vi
			.spyOn(window, "open")
			.mockReturnValue(failure === "blocked" ? null : popup)
		if (failure === "unsupported") delete (window as WindowWithManagement).getScreenDetails
		if (failure === "permission denied") {
			;(window as WindowWithManagement).getScreenDetails = vi.fn(async () => {
				throw new Error("denied")
			})
		}
		if (failure === "single display") {
			;(window as WindowWithManagement).getScreenDetails = vi.fn(async () => ({
				currentScreen,
				screens: [currentScreen],
			}))
		}
		if (failure === "duplicate current display") {
			;(window as WindowWithManagement).getScreenDetails = vi.fn(async () => ({
				currentScreen,
				screens: [currentScreen, { ...currentScreen, label: "Duplicate" }],
			}))
		}
		const { result } = renderHook(() => usePPTPresenterWindow())

		await act(async () => {
			expect(await result.current.open({ index: 0, html: "<main>Slide</main>" })).toBe(
				"fallback",
			)
		})
		expect(result.current.isFallbackOnly).toBe(true)
		await act(async () => {
			expect(await result.current.open({ index: 0, html: "<main>Again</main>" })).toBe(
				"fallback",
			)
		})
		if (failure === "unsupported") expect(windowOpen).not.toHaveBeenCalled()
		else expect(windowOpen).toHaveBeenCalledTimes(1)
		if (
			["permission denied", "single display", "duplicate current display"].includes(failure)
		) {
			expect(popup.close).toHaveBeenCalled()
		}
		expect(result.current.isOpen).toBe(false)
	})

	it.each(["screen enumeration", "fullscreen"])(
		"keeps the latest slide when navigation occurs during %s",
		async (phase) => {
			const popup = createPopup()
			const pending = createDeferred<void>()
			if (phase === "screen enumeration") {
				;(window as WindowWithManagement).getScreenDetails = vi.fn(async () => {
					await pending.promise
					return { currentScreen, screens: [currentScreen, externalScreen] }
				})
			} else {
				;(
					popup.document.documentElement.requestFullscreen as ReturnType<typeof vi.fn>
				).mockImplementation(() => pending.promise)
			}
			vi.spyOn(window, "open").mockReturnValue(popup)
			const { result } = renderHook(() => usePPTPresenterWindow())
			const initial = { index: 0, html: "<main>First</main>" }
			const latest = {
				index: 1,
				html: "<main>Second</main>",
				dimensions: { width: 960, height: 720 },
			}
			let openPromise!: Promise<"opened" | "fallback" | "cancelled">
			await act(async () => {
				openPromise = result.current.open(initial)
				await Promise.resolve()
			})
			act(() => expect(result.current.post(latest)).toBe(true))
			await act(async () => {
				pending.resolve()
				expect(await openPromise).toBe("opened")
			})
			expect(popup.postMessage).toHaveBeenLastCalledWith(
				{ type: "ppt-presenter:slide", payload: latest },
				window.location.origin,
			)
			expect(popup.__frame.style.width).toBe("960px")
			expect(popup.__frame.style.height).toBe("720px")
		},
	)

	it("cancels screen enumeration when the presenter is closed", async () => {
		const popup = createPopup()
		const screenDetails = createDeferred<{
			currentScreen: typeof currentScreen
			screens: Array<typeof currentScreen | typeof externalScreen>
		}>()
		;(window as WindowWithManagement).getScreenDetails = vi.fn(() => screenDetails.promise)
		vi.spyOn(window, "open").mockReturnValue(popup)
		const { result } = renderHook(() => usePPTPresenterWindow())
		let openPromise!: Promise<"opened" | "fallback" | "cancelled">

		act(() => {
			openPromise = result.current.open({ index: 0, html: "<main>Slide</main>" })
		})
		act(() => result.current.close())
		await act(async () => {
			screenDetails.resolve({ currentScreen, screens: [currentScreen, externalScreen] })
			expect(await openPromise).toBe("cancelled")
		})

		expect(popup.moveTo).not.toHaveBeenCalled()
		expect(popup.postMessage).not.toHaveBeenCalled()
		expect(result.current.isFallbackOnly).toBe(false)
	})

	it("cancels screen enumeration when the presenter unmounts", async () => {
		const popup = createPopup()
		const screenDetails = createDeferred<{
			currentScreen: typeof currentScreen
			screens: Array<typeof currentScreen | typeof externalScreen>
		}>()
		;(window as WindowWithManagement).getScreenDetails = vi.fn(() => screenDetails.promise)
		vi.spyOn(window, "open").mockReturnValue(popup)
		const { result, unmount } = renderHook(() => usePPTPresenterWindow())
		let openPromise!: Promise<"opened" | "fallback" | "cancelled">

		act(() => {
			openPromise = result.current.open({ index: 0, html: "<main>Slide</main>" })
		})
		unmount()
		await act(async () => {
			screenDetails.resolve({ currentScreen, screens: [currentScreen, externalScreen] })
			expect(await openPromise).toBe("cancelled")
		})

		expect(popup.moveTo).not.toHaveBeenCalled()
		expect(popup.postMessage).not.toHaveBeenCalled()
	})

	it("closes and clears presenter state", async () => {
		const popup = createPopup()
		vi.spyOn(window, "open").mockReturnValue(popup)
		const { result } = renderHook(() => usePPTPresenterWindow())
		await act(async () => {
			await result.current.open({ index: 0, html: "<main>Slide</main>" })
		})

		act(() => result.current.close())

		expect(popup.close).toHaveBeenCalled()
		expect(result.current.isOpen).toBe(false)
		act(() => {
			expect(result.current.post({ index: 1, html: "<main>Next</main>" })).toBe(false)
		})
	})
})
