import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import install from "../service-worker"

describe("service worker compatibility runtime", () => {
	beforeEach(() => {
		vi.stubGlobal("navigator", { userAgent: "ordinary browser" })
	})
	afterEach(() => {
		vi.unstubAllGlobals()
		vi.restoreAllMocks()
	})

	it("does not create a mock in off mode or ordinary browsers in auto mode", () => {
		install({ mode: "auto" })
		expect("serviceWorker" in navigator).toBe(false)
		vi.stubGlobal("navigator", { userAgent: "DingTalk" })
		install({ mode: "off" })
		expect("serviceWorker" in navigator).toBe(false)
	})

	it.each(["DingTalk", "AliApp(DingTalk/1)", "wxwork", "WeCom", "Feishu", "Lark"])(
		"supplies registration behavior for %s in auto mode",
		async (userAgent) => {
			vi.stubGlobal("navigator", { userAgent })
			install({ mode: "auto" })
			const container = navigator.serviceWorker
			const registration = await container.register("/worker.js", { scope: "/app/" })
			expect(registration.scope).toBe("/app/")
			expect(registration.active?.state).toBe("activated")
			expect(registration.installing).toBeNull()
			expect(registration.waiting).toBeNull()
			await expect(registration.update()).resolves.toBeUndefined()
			await expect(registration.unregister()).resolves.toBe(true)
			await expect(container.getRegistration()).resolves.toBeNull()
			await expect(container.getRegistrations()).resolves.toEqual([])
			expect(container.controller).toBeNull()
			expect(container.dispatchEvent(new Event("message"))).toBe(true)
		},
	)

	it("forced mode exposes ready and default scope without replacing an existing container", async () => {
		install({ mode: "on" })
		const container = navigator.serviceWorker
		const registration = await container.register("/worker.js")
		expect(registration.scope).toBe("/")
		const ready = await container.ready
		expect(ready.scope).toBe("/")
		expect(ready.active?.state).toBe("activated")
		await expect(ready.unregister()).resolves.toBe(true)
		install({ mode: "on" })
		expect(navigator.serviceWorker).toBe(container)
		expect(Object.getOwnPropertyDescriptor(navigator, "serviceWorker")).toMatchObject({
			writable: false,
			configurable: true,
		})
	})

	it("preserves a real native service worker implementation", () => {
		const nativeContainer = { register: vi.fn() }
		vi.stubGlobal("navigator", { userAgent: "DingTalk", serviceWorker: nativeContainer })
		install({ mode: "on" })
		expect(navigator.serviceWorker).toBe(nativeContainer)
	})

	it("continues when an embedded browser forbids replacing the property", () => {
		Object.defineProperty(navigator, "serviceWorker", { value: undefined, configurable: false })
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
		expect(() => install({ mode: "on" })).not.toThrow()
		expect(warn).toHaveBeenCalledWith("ServiceWorker mock skipped:", expect.any(String))
		expect(navigator.serviceWorker).toBeUndefined()
	})
})
