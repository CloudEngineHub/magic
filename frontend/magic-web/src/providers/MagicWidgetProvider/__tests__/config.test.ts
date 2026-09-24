import { describe, expect, it } from "vitest"
import { acceptMagicWidgetConfig } from "../config"

describe("acceptMagicWidgetConfig", () => {
	it("keeps host field values that the iframe no longer revalidates", () => {
		const value = {
			header: { title: "   ", actions: { rename: true } },
			conversation: { projectFiles: "invalid" },
		}

		expect(acceptMagicWidgetConfig(value)).toEqual(value)
	})

	it("rejects values that cannot be stored as a config snapshot", () => {
		expect(() => acceptMagicWidgetConfig(undefined)).toThrow(/must be an object/)
		expect(() => acceptMagicWidgetConfig(null)).toThrow(/must be an object/)
		expect(() => acceptMagicWidgetConfig([])).toThrow(/must be an object/)
		expect(() => acceptMagicWidgetConfig("desktop")).toThrow(/must be an object/)
	})
})
