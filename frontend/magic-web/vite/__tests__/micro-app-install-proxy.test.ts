import { describe, expect, it } from "vitest"
import {
	resolveMicroAppInstallDevProxy,
	resolveMicroAppInstallDevProxyTarget,
} from "../micro-app-install-proxy"

describe("resolveMicroAppInstallDevProxyTarget", () => {
	it("prefers MAGIC_DEV_NODE_PROXY over other sources", () => {
		expect(
			resolveMicroAppInstallDevProxyTarget({
				MAGIC_DEV_NODE_PROXY: "https://node.example.com",
				MAGIC_WEB_URL: "https://web.example.com",
			}),
		).toBe("https://node.example.com")
	})

	it("accepts host-only MAGIC_DEV_NODE_PROXY values", () => {
		expect(
			resolveMicroAppInstallDevProxyTarget({
				MAGIC_DEV_NODE_PROXY: "magic-web.example.test",
			}),
		).toBe("https://magic-web.example.test")
	})

	it("falls back to profile runtime config origin", () => {
		expect(
			resolveMicroAppInstallDevProxyTarget(
				{},
				{
					fallbackOrigin: "https://magic-web.example.test",
				},
			),
		).toBe("https://magic-web.example.test")
	})

	it("falls back to MAGIC_WEB_URL when explicit proxy target is absent", () => {
		expect(
			resolveMicroAppInstallDevProxyTarget({
				MAGIC_WEB_URL: "https://web.example.com/default/super",
			}),
		).toBe("https://web.example.com")
	})
})

describe("resolveMicroAppInstallDevProxy", () => {
	it("returns manifest and icon proxy rules for a configured target", () => {
		const proxy = resolveMicroAppInstallDevProxy({
			MAGIC_DEV_NODE_PROXY: "https://node.example.com",
		})

		expect(Object.keys(proxy)).toEqual([
			"^/micro-app/[^/]+/manifest\\.webmanifest$",
			"^/micro-app/[^/]+/icon",
		])
		expect(proxy["^/micro-app/[^/]+/manifest\\.webmanifest$"]).toMatchObject({
			target: "https://node.example.com",
			changeOrigin: true,
			secure: true,
		})
	})

	it("returns an empty object when no proxy target is configured", () => {
		expect(resolveMicroAppInstallDevProxy({})).toEqual({})
	})
})
