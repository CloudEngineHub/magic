import { afterEach, describe, expect, it, vi } from "vitest"

const { datafluxRum } = vi.hoisted(() => ({
	datafluxRum: {
		init: vi.fn(),
		setUser: vi.fn(),
		setGlobalContextProperty: vi.fn(),
		addError: vi.fn(),
		addAction: vi.fn(),
	},
}))

// @ts-expect-error Vitest's virtual mock overload is available at runtime but missing in the package's older type declarations.
vi.mock("@cloudcare/browser-rum", () => ({ datafluxRum }), { virtual: true })

import { DataFluxProvider } from "../index"

describe("DataFluxProvider", () => {
	afterEach(() => {
		vi.clearAllMocks()
	})

	it("initializes the official SDK with DataFlux configuration", async () => {
		const provider = new DataFluxProvider()

		await provider.init({
			type: "DataFlux",
			appId: "application-id",
			token: "client-token",
			site: "https://gc-rum.example.com",
			env: "staging",
			service: "magic-web",
			version: "1.2.3",
			sessionSampleRate: 100,
			sessionReplaySampleRate: 70,
			trackUserInteractions: true,
		})

		expect(datafluxRum.init).toHaveBeenCalledWith(
			expect.objectContaining({
				applicationId: "application-id",
				clientToken: "client-token",
				site: "https://gc-rum.example.com",
				env: "staging",
				service: "magic-web",
				version: "1.2.3",
				sessionSampleRate: 100,
				sessionReplaySampleRate: 70,
				trackUserInteractions: true,
			}),
		)
	})

	it("forwards user, error, config, and custom action data", async () => {
		const provider = new DataFluxProvider()
		await provider.init({
			type: "DataFlux",
			appId: "application-id",
			token: "client-token",
			site: "https://gc-rum.example.com",
		})

		const error = new Error("request failed")
		provider.setUser({ id: "user-1", name: "Ada" })
		provider.setConfig({ release: "release-1", userId: "user-1" })
		provider.error(error, { requestId: "request-1" })
		provider.report({ name: "button_click", properties: { button: "submit" } })

		expect(datafluxRum.setUser).toHaveBeenCalledWith({ id: "user-1", name: "Ada" })
		expect(datafluxRum.setGlobalContextProperty).toHaveBeenNthCalledWith(1, "release", "release-1")
		expect(datafluxRum.setGlobalContextProperty).toHaveBeenNthCalledWith(2, "userId", "user-1")
		expect(datafluxRum.addError).toHaveBeenCalledWith(error, { requestId: "request-1" })
		expect(datafluxRum.addAction).toHaveBeenCalledWith("button_click", { button: "submit" })
	})

	it("requires a DataFlux site", async () => {
		const provider = new DataFluxProvider()

		await expect(
			provider.init({
				type: "DataFlux",
				appId: "application-id",
				token: "client-token",
				site: "",
			}),
		).rejects.toThrow("site is required")
	})

	it("tracks lifecycle state without reinitializing the SDK", async () => {
		const provider = new DataFluxProvider()
		await provider.init({
			type: "DataFlux",
			appId: "application-id",
			token: "client-token",
			site: "https://gc-rum.example.com",
		})

		provider.start()
		provider.stop()

		expect(datafluxRum.init).toHaveBeenCalledTimes(1)
	})
})
