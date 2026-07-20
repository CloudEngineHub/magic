import { describe, expect, it } from "vitest"
import { ToolsMap } from "../tools"

describe("ToolsMap", () => {
	it("registers only the micro_app_plan renderer name", () => {
		expect(ToolsMap.micro_app_plan).toBeDefined()
		expect(ToolsMap.plan).toBeUndefined()
	})
})
