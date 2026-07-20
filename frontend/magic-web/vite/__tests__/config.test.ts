import { describe, expect, it } from "vitest"
import { MAGIC_ENV_PROFILE_PLUGIN_NAME } from "../../plugins/vite-plugin-env-profiles"
import { getConfig } from "../config"

describe("base Vite layer config", () => {
	it("uses the shared env profile plugin without enterprise profile definitions", () => {
		const config = getConfig({ projectRoot: "/tmp/does-not-matter" })
		const plugin = config.plugins?.find((item) => {
			if (!item || typeof item === "boolean" || Array.isArray(item)) return false
			if (typeof item !== "object" || !("name" in item)) return false
			return item.name === MAGIC_ENV_PROFILE_PLUGIN_NAME
		})

		expect(plugin).toBeDefined()
		expect(JSON.stringify(config)).not.toContain("letsmagic.cn")
		expect(JSON.stringify(config)).not.toContain("magicrew.ai")
	})
})
