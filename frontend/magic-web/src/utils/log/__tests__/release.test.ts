import { afterEach, describe, expect, it } from "vitest"
import { getAppRelease } from "../release"

describe("getAppRelease", () => {
	const originalConfig = window.CONFIG

	afterEach(() => {
		window.CONFIG = originalConfig
	})

	it("uses the same version-over-SHA precedence as the APM probe", () => {
		window.CONFIG = {
			...originalConfig,
			MAGIC_APP_VERSION: "3.10.7",
			MAGIC_APP_SHA: "commit-sha",
		}

		expect(getAppRelease()).toBe("3.10.7")
	})

	it("falls back to the commit SHA when no tag is available", () => {
		window.CONFIG = {
			...originalConfig,
			MAGIC_APP_VERSION: "",
			MAGIC_APP_SHA: "commit-sha",
		}

		expect(getAppRelease()).toBe("commit-sha")
	})
})
