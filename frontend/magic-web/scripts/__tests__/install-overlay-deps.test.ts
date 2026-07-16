import { createRequire } from "node:module"
import { describe, expect, it, vi } from "vitest"

const require = createRequire(import.meta.url)

const {
	cleanedEnv,
	installOverlayDeps,
	shouldPassthrough,
} = require("../install-overlay-deps.cjs") as typeof import("../install-overlay-deps.cjs")

const NOOP_LOGGER = () => {}

describe("shouldPassthrough", () => {
	it("returns true for registry variables", () => {
		expect(shouldPassthrough("NPM_CONFIG_REGISTRY")).toBe(true)
		expect(shouldPassthrough("npm_config_registry")).toBe(true)
	})

	it("returns true for scoped registry variables", () => {
		expect(shouldPassthrough("npm_config_@feb:registry")).toBe(true)
		expect(shouldPassthrough("npm_config_@magic:registry")).toBe(true)
	})

	it("returns true for auth token variables", () => {
		expect(shouldPassthrough("npm_config_//private.registry.com/:_authToken")).toBe(true)
		expect(shouldPassthrough("npm_config_//registry.npmmirror.com/:_auth")).toBe(true)
	})

	it("returns true for proxy variables", () => {
		expect(shouldPassthrough("NPM_CONFIG_PROXY")).toBe(true)
		expect(shouldPassthrough("npm_config_https_proxy")).toBe(true)
		expect(shouldPassthrough("npm_config_https-proxy")).toBe(true)
		expect(shouldPassthrough("npm_config_no_proxy")).toBe(true)
		expect(shouldPassthrough("NPM_CONFIG_NOPROXY")).toBe(true)
	})

	it("returns true for SSL/TLS variables", () => {
		expect(shouldPassthrough("npm_config_strict_ssl")).toBe(true)
		expect(shouldPassthrough("npm_config_cafile")).toBe(true)
		expect(shouldPassthrough("npm_config_cert")).toBe(true)
	})

	it("returns true for config file pointers", () => {
		expect(shouldPassthrough("NPM_CONFIG_USERCONFIG")).toBe(true)
		expect(shouldPassthrough("npm_config_globalconfig")).toBe(true)
	})

	it("returns false for CLI flags that should be stripped", () => {
		expect(shouldPassthrough("npm_config_frozen_lockfile")).toBe(false)
		expect(shouldPassthrough("npm_config_offline")).toBe(false)
		expect(shouldPassthrough("npm_config_filter")).toBe(false)
		expect(shouldPassthrough("npm_config_prefer_offline")).toBe(false)
		expect(shouldPassthrough("npm_config_workspace_root")).toBe(false)
	})

	it("returns false for non npm_config_ variables", () => {
		expect(shouldPassthrough("PATH")).toBe(false)
		expect(shouldPassthrough("CI")).toBe(false)
	})
})

describe("cleanedEnv", () => {
	it("strips parent CLI flags (frozen-lockfile, offline, filter)", () => {
		const env = {
			PATH: "/usr/bin",
			CI: "true",
			npm_config_frozen_lockfile: "true",
			npm_config_offline: "true",
			npm_config_filter: "@magic-web/core",
		}

		const result = cleanedEnv(env)

		expect(result).toEqual({ PATH: "/usr/bin", CI: "true" })
	})

	it("preserves registry configuration", () => {
		const env = {
			PATH: "/usr/bin",
			NPM_CONFIG_REGISTRY: "https://private.registry.com",
			"npm_config_@feb:registry": "https://feb.registry.com",
		}

		const result = cleanedEnv(env)

		expect(result.NPM_CONFIG_REGISTRY).toBe("https://private.registry.com")
		expect(result["npm_config_@feb:registry"]).toBe("https://feb.registry.com")
		expect(result.PATH).toBe("/usr/bin")
	})

	it("preserves auth tokens", () => {
		const env = {
			PATH: "/usr/bin",
			"npm_config_//private.registry.com/:_authToken": "secret123",
			"npm_config_//another.registry.com/:_auth": "base64encoded",
		}

		const result = cleanedEnv(env)

		expect(result["npm_config_//private.registry.com/:_authToken"]).toBe("secret123")
		expect(result["npm_config_//another.registry.com/:_auth"]).toBe("base64encoded")
	})

	it("preserves proxy settings", () => {
		const env = {
			PATH: "/usr/bin",
			NPM_CONFIG_HTTPS_PROXY: "http://proxy:8080",
			npm_config_no_proxy: "*.internal.com",
		}

		const result = cleanedEnv(env)

		expect(result.NPM_CONFIG_HTTPS_PROXY).toBe("http://proxy:8080")
		expect(result.npm_config_no_proxy).toBe("*.internal.com")
	})

	it("preserves SSL/config file pointers alongside stripping CLI flags", () => {
		const env = {
			PATH: "/usr/bin",
			npm_config_frozen_lockfile: "true",
			NPM_CONFIG_USERCONFIG: "/home/ci/.npmrc-private",
			npm_config_cafile: "/etc/ssl/certs/corporate.pem",
			npm_config_strict_ssl: "true",
		}

		const result = cleanedEnv(env)

		expect(result).toEqual({
			PATH: "/usr/bin",
			NPM_CONFIG_USERCONFIG: "/home/ci/.npmrc-private",
			npm_config_cafile: "/etc/ssl/certs/corporate.pem",
			npm_config_strict_ssl: "true",
		})
	})
})

describe("installOverlayDeps", () => {
	it("skips overlay folders without a package.json", () => {
		const spawn = vi.fn()

		const installed = installOverlayDeps({
			projectRoot: "/repo",
			overlayFolders: ["enterprise", "customer"],
			fileExists: () => false,
			spawn,
			logger: NOOP_LOGGER,
		})

		expect(installed).toEqual([])
		expect(spawn).not.toHaveBeenCalled()
	})

	it("installs every overlay folder that declares a package.json", () => {
		const spawn = vi.fn().mockReturnValue({ status: 0 })

		const installed = installOverlayDeps({
			projectRoot: "/repo",
			env: {
				PATH: "/usr/bin",
				npm_config_offline: "true",
				NPM_CONFIG_REGISTRY: "https://private.registry.com",
			},
			overlayFolders: ["enterprise", "customer"],
			fileExists: (filePath) => String(filePath) === "/repo/enterprise/package.json",
			spawn,
			logger: NOOP_LOGGER,
		})

		expect(installed).toEqual(["enterprise"])
		expect(spawn).toHaveBeenCalledTimes(1)

		const [command, args, options] = spawn.mock.calls[0]
		expect(command).toBe("corepack")
		expect(args).toEqual(["pnpm", "install", "--dir", "enterprise"])
		expect(options.cwd).toBe("/repo")
		// CLI flags stripped, but registry config preserved
		expect(options.env).toEqual({
			PATH: "/usr/bin",
			NPM_CONFIG_REGISTRY: "https://private.registry.com",
		})
	})

	it("throws when an overlay install exits with a non-zero code", () => {
		const spawn = vi.fn().mockReturnValue({ status: 7 })

		expect(() =>
			installOverlayDeps({
				projectRoot: "/repo",
				overlayFolders: ["enterprise"],
				fileExists: () => true,
				spawn,
				logger: NOOP_LOGGER,
			}),
		).toThrow("enterprise/ dependency install failed with exit code 7")
	})
})
