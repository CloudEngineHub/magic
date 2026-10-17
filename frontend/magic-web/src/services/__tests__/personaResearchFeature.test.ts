import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { isPersonaResearchEnabled } from "../personaResearchFeature"

vi.mock("@/models/config/stores/cluster.store", () => ({
	clusterStore: { clusterConfig: null },
}))

describe("isPersonaResearchEnabled", () => {
	const originalConfig = window.CONFIG

	beforeEach(() => {
		window.CONFIG = { DEV: false }
		vi.stubEnv("MAGIC_PERSONA_RESEARCH_ENABLED", undefined)
		vi.stubEnv("MAGIC_IS_PRIVATE_DEPLOY", "false")
	})

	afterEach(() => {
		window.CONFIG = originalConfig
		vi.unstubAllEnvs()
	})

	it.each(["true", "false"])(
		"explicit values override %s private deployment",
		(privateDeploy) => {
			vi.stubEnv("MAGIC_IS_PRIVATE_DEPLOY", privateDeploy)
			vi.stubEnv("MAGIC_PERSONA_RESEARCH_ENABLED", "true")
			expect(isPersonaResearchEnabled()).toBe(true)

			vi.stubEnv("MAGIC_PERSONA_RESEARCH_ENABLED", "false")
			expect(isPersonaResearchEnabled()).toBe(false)
		},
	)

	it.each([undefined, "", "invalid", "TRUE", "1"])(
		"preserves deployment defaults for %s",
		(enabled) => {
			vi.stubEnv("MAGIC_PERSONA_RESEARCH_ENABLED", enabled)
			expect(isPersonaResearchEnabled()).toBe(true)

			vi.stubEnv("MAGIC_IS_PRIVATE_DEPLOY", "true")
			expect(isPersonaResearchEnabled()).toBe(false)
		},
	)

	it.each([
		["true", "false", false],
		["false", "true", true],
	] as const)("build %s is overridden by runtime %s", (buildValue, runtimeValue, expected) => {
		vi.stubEnv("MAGIC_PERSONA_RESEARCH_ENABLED", buildValue)
		window.CONFIG.MAGIC_PERSONA_RESEARCH_ENABLED = runtimeValue
		expect(isPersonaResearchEnabled()).toBe(expected)
	})

	it("uses the runtime deployment default when the override is empty", () => {
		vi.stubEnv("MAGIC_PERSONA_RESEARCH_ENABLED", "true")
		window.CONFIG = {
			DEV: false,
			MAGIC_PERSONA_RESEARCH_ENABLED: "" as ImportMetaEnv["MAGIC_PERSONA_RESEARCH_ENABLED"],
			MAGIC_IS_PRIVATE_DEPLOY: "true",
		}
		expect(isPersonaResearchEnabled()).toBe(false)
	})
})
