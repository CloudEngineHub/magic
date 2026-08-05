import { describe, expect, it } from "vitest"

import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import { resolveMicroAppModelSelectionMode } from "../microAppModelMode"

describe("resolveMicroAppModelSelectionMode", () => {
	it("always uses the default model catalog", () => {
		expect(resolveMicroAppModelSelectionMode()).toBe(TopicMode.Default)
	})
})
