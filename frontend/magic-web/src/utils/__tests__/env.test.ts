import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { isLoginAuthorizationWhitelist } from "../env"

describe("isLoginAuthorizationWhitelist", () => {
	const originalConfig = window.CONFIG

	beforeEach(() => {
		window.CONFIG = {
			...originalConfig,
			MAGIC_LOGIN_AUTHORIZATION_WHITELIST:
				"https://trusted.example.com, https://trusted.example.com:8443/callback",
		}
	})

	afterEach(() => {
		window.CONFIG = originalConfig
	})

	it("matches the same origin regardless of path or query parameters", () => {
		expect(
			isLoginAuthorizationWhitelist(
				"https://trusted.example.com/oauth/callback?authorization=token",
			),
		).toBe(true)
	})

	it("requires the protocol, hostname, and port to match", () => {
		expect(isLoginAuthorizationWhitelist("http://trusted.example.com/callback")).toBe(false)
		expect(isLoginAuthorizationWhitelist("https://trusted.example.com:9443/callback")).toBe(
			false,
		)
		expect(isLoginAuthorizationWhitelist("https://trusted.example.com:8443/other")).toBe(true)
	})

	it("rejects lookalike hosts and unsupported protocols", () => {
		expect(
			isLoginAuthorizationWhitelist("https://trusted.example.com.evil.test/callback"),
		).toBe(false)
		expect(isLoginAuthorizationWhitelist("javascript:alert(1)")).toBe(false)
	})

	it("rejects malformed URLs and ignores malformed whitelist entries", () => {
		expect(isLoginAuthorizationWhitelist("not-a-url")).toBe(false)

		window.CONFIG = {
			...window.CONFIG,
			MAGIC_LOGIN_AUTHORIZATION_WHITELIST: "not-a-url,https://trusted.example.com",
		}
		expect(isLoginAuthorizationWhitelist("https://trusted.example.com/callback")).toBe(true)
	})
})
