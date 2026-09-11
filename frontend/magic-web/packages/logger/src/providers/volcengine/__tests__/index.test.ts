import { afterEach, describe, expect, it, vi } from "vitest"

describe("VolcengineProvider", () => {
	afterEach(() => {
		vi.resetModules()
		vi.restoreAllMocks()
	})

	it("loads the optional SDK and integrations only during provider initialization", async () => {
		let sdkEvaluated = false
		let integrationsEvaluated = false
		const browserClient = vi.fn()

		vi.doMock("@apmplus/web", () => {
			sdkEvaluated = true
			return { default: browserClient }
		})
		vi.doMock("@apmplus/integrations", () => {
			integrationsEvaluated = true
			return { SPALoadPlugin: vi.fn(() => ({ name: "spa" })) }
		})
		vi.doMock("@apmplus/integrations/blankScreen", () => {
			integrationsEvaluated = true
			return { blankScreenPlugin: vi.fn(() => ({ name: "blank-screen" })) }
		})
		vi.doMock("@/routes/history/helpers", () => ({ routesMatch: vi.fn(() => undefined) }))

		const { VolcengineProvider } = await import("../index")

		expect(sdkEvaluated).toBe(false)
		expect(integrationsEvaluated).toBe(false)

		const provider = new VolcengineProvider()
		await provider.init({
			type: "Volcengine",
			appId: "123",
			aid: 123,
			token: "client-token",
		})

		expect(sdkEvaluated).toBe(true)
		expect(integrationsEvaluated).toBe(true)
		expect(browserClient).toHaveBeenCalledWith("init", expect.any(Object))
	})
})
