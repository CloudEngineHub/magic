import { describe, expect, it } from "vitest"
import { plugin } from "../plugins/JSErrorPlugin"

describe("Volcengine JSErrorPlugin config", () => {
	it("leaves global errors to the application ErrorMonitorPlugin", () => {
		expect(plugin()).toMatchObject({
			onerror: false,
			onunhandledrejection: false,
		})
	})
})
