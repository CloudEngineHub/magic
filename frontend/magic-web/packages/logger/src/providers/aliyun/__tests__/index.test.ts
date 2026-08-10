import { afterEach, describe, expect, it, vi } from "vitest"

const { armsConstructor } = vi.hoisted(() => ({ armsConstructor: vi.fn() }))

vi.mock("@arms/rum-browser", () => ({ ArmsRum: armsConstructor }))

import { AliyunProvider } from "../index"

describe("AliyunProvider release", () => {
	const originalConfig = window.CONFIG

	afterEach(() => {
		window.CONFIG = originalConfig
		armsConstructor.mockReset()
	})

	it("uses the shared app release before a Provider-specific version", async () => {
		window.CONFIG = {
			...originalConfig,
			MAGIC_APP_VERSION: "3.10.7",
			MAGIC_APP_SHA: "commit-sha",
		}
		const provider = new AliyunProvider()

		await provider.init({
			type: "Aliyun",
			appId: "app-id",
			token: "token",
			pid: "pid",
			version: "provider-version",
		})

		expect(armsConstructor).toHaveBeenCalledWith(expect.objectContaining({ version: "3.10.7" }))
	})

	it("keeps the Provider version as a compatibility fallback", async () => {
		window.CONFIG = {
			...originalConfig,
			MAGIC_APP_VERSION: "",
			MAGIC_APP_SHA: "",
		}
		const provider = new AliyunProvider()

		await provider.init({
			type: "Aliyun",
			appId: "app-id",
			token: "token",
			pid: "pid",
			version: "provider-version",
		})

		expect(armsConstructor).toHaveBeenCalledWith(
			expect.objectContaining({ version: "provider-version" }),
		)
	})
})
