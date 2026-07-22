import { describe, expect, it, beforeEach, vi } from "vitest"

const envState = vi.hoisted(() => ({
	isTestEnv: false,
}))

vi.mock("@/utils/env", () => ({
	isTestEnv: () => envState.isTestEnv,
}))

import { canUseDesignPlugins } from "../pluginAccess"

describe("canUseDesignPlugins", () => {
	beforeEach(() => {
		envState.isTestEnv = false
	})

	it("allows access for whitelisted organizations", () => {
		expect(canUseDesignPlugins("EAVT467")).toBe(true)
		expect(canUseDesignPlugins("41036eed2c3ada9fb8460883fcebba81")).toBe(true)
	})

	it("denies access for other organizations outside test env", () => {
		expect(canUseDesignPlugins("unknown-org")).toBe(false)
		expect(canUseDesignPlugins()).toBe(false)
	})

	it("allows access in test env regardless of organization code", () => {
		envState.isTestEnv = true

		expect(canUseDesignPlugins()).toBe(true)
		expect(canUseDesignPlugins("unknown-org")).toBe(true)
	})
})
