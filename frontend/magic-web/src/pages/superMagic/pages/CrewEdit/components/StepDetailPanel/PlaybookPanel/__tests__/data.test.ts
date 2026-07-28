import { describe, expect, it } from "vitest"
import { CURRENT_DEMO_PANEL_SCHEMA_VERSION } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import { createDefaultScene } from "../data"

describe("createDefaultScene", () => {
	it("creates new inspiration data with the current identity schema", () => {
		expect(createDefaultScene().configs?.inspiration?.schema_version).toBe(
			CURRENT_DEMO_PANEL_SCHEMA_VERSION,
		)
	})
})
