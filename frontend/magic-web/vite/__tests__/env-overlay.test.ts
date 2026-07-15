import fs from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { resolveConfig } from "vite"
import { getOverlayViteConfig } from "../overlay"

const require = createRequire(import.meta.url)
const { loadLayeredEnvFiles } = require("../../scripts/lib/env-overlay.cjs") as {
	loadLayeredEnvFiles: (options: {
		projectRoot: string
		mode: string
		processEnv: Record<string, string | undefined>
	}) => {
		env: Record<string, string | undefined>
		files: Array<{ fileName: string; filePath: string; layer: string }>
	}
}

const ENV_KEYS = [
	"MAGIC_ENV_OVERLAY_BASE_ONLY",
	"MAGIC_ENV_OVERLAY_LOCAL_ONLY",
	"MAGIC_ENV_OVERLAY_SHARED",
] as const
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))
const tempRoots: string[] = []

function createTempProject(): string {
	const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "magic-env-overlay-"))
	tempRoots.push(projectRoot)
	fs.mkdirSync(path.join(projectRoot, "src"), { recursive: true })
	fs.mkdirSync(path.join(projectRoot, "enterprise/src"), { recursive: true })
	return projectRoot
}

function writeEnvFile(projectRoot: string, relativePath: string, content: string): void {
	const filePath = path.join(projectRoot, relativePath)
	fs.mkdirSync(path.dirname(filePath), { recursive: true })
	fs.writeFileSync(filePath, content, "utf8")
}

afterEach(() => {
	for (const tempRoot of tempRoots.splice(0)) {
		fs.rmSync(tempRoot, { recursive: true, force: true })
	}

	for (const key of ENV_KEYS) {
		const originalValue = originalEnv[key]
		if (originalValue === undefined) delete process.env[key]
		else process.env[key] = originalValue
	}
})

describe("layered env file overlay", () => {
	it("replaces the entire baseline .env file with the enterprise .env file", async () => {
		const projectRoot = createTempProject()
		writeEnvFile(
			projectRoot,
			".env",
			"MAGIC_ENV_OVERLAY_BASE_ONLY=base\nMAGIC_ENV_OVERLAY_SHARED=base\n",
		)
		writeEnvFile(projectRoot, "enterprise/.env", "MAGIC_ENV_OVERLAY_SHARED=enterprise\n")

		for (const key of ENV_KEYS) delete process.env[key]
		const config = getOverlayViteConfig({ projectRoot })
		const resolvedConfig = await resolveConfig(
			{ ...config, configFile: false, envPrefix: "MAGIC_", logLevel: "silent" },
			"serve",
			"development",
		)

		expect(config.envDir).toBe(false)
		expect(process.env.MAGIC_ENV_OVERLAY_SHARED).toBe("enterprise")
		expect(process.env.MAGIC_ENV_OVERLAY_BASE_ONLY).toBeUndefined()
		expect(resolvedConfig.env.MAGIC_ENV_OVERLAY_SHARED).toBe("enterprise")
		expect(resolvedConfig.env.MAGIC_ENV_OVERLAY_BASE_ONLY).toBeUndefined()
	})

	it("falls back independently for env file names missing from the enterprise layer", () => {
		const projectRoot = createTempProject()
		writeEnvFile(
			projectRoot,
			".env",
			"MAGIC_ENV_OVERLAY_BASE_ONLY=base\nMAGIC_ENV_OVERLAY_SHARED=base\n",
		)
		writeEnvFile(projectRoot, ".env.local", "MAGIC_ENV_OVERLAY_LOCAL_ONLY=base-local\n")
		writeEnvFile(projectRoot, "enterprise/.env", "MAGIC_ENV_OVERLAY_SHARED=enterprise\n")

		const result = loadLayeredEnvFiles({ projectRoot, mode: "development", processEnv: {} })

		expect(result.env).toMatchObject({
			MAGIC_ENV_OVERLAY_LOCAL_ONLY: "base-local",
			MAGIC_ENV_OVERLAY_SHARED: "enterprise",
		})
		expect(result.env.MAGIC_ENV_OVERLAY_BASE_ONLY).toBeUndefined()
		expect(result.files.map((file) => [file.fileName, file.layer])).toEqual([
			[".env", "enterprise"],
			[".env.local", "base"],
		])
	})

	it("lets the customer layer replace the entire enterprise file", () => {
		const projectRoot = createTempProject()
		fs.mkdirSync(path.join(projectRoot, "customer/src"), { recursive: true })
		writeEnvFile(
			projectRoot,
			"enterprise/.env",
			"MAGIC_ENV_OVERLAY_BASE_ONLY=enterprise-only\nMAGIC_ENV_OVERLAY_SHARED=enterprise\n",
		)
		writeEnvFile(projectRoot, "customer/.env", "MAGIC_ENV_OVERLAY_SHARED=customer\n")

		const result = loadLayeredEnvFiles({ projectRoot, mode: "development", processEnv: {} })

		expect(result.env.MAGIC_ENV_OVERLAY_SHARED).toBe("customer")
		expect(result.env.MAGIC_ENV_OVERLAY_BASE_ONLY).toBeUndefined()
		expect(result.files[0]?.layer).toBe("customer")
	})

	it("keeps shell variables above the winning mode-specific file", () => {
		const projectRoot = createTempProject()
		writeEnvFile(
			projectRoot,
			".env.production",
			"MAGIC_ENV_OVERLAY_BASE_ONLY=base-mode\nMAGIC_ENV_OVERLAY_SHARED=base-mode\n",
		)
		writeEnvFile(
			projectRoot,
			"enterprise/.env.production",
			"MAGIC_ENV_OVERLAY_SHARED=enterprise-mode\n",
		)

		const result = loadLayeredEnvFiles({
			projectRoot,
			mode: "production",
			processEnv: { MAGIC_ENV_OVERLAY_SHARED: "shell" },
		})

		expect(result.env.MAGIC_ENV_OVERLAY_SHARED).toBe("shell")
		expect(result.env.MAGIC_ENV_OVERLAY_BASE_ONLY).toBeUndefined()
		expect(result.files.map((file) => file.fileName)).toEqual([".env.production"])
	})

	it("does not let an env file activate an otherwise absent overlay layer", () => {
		const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "magic-env-overlay-inactive-"))
		tempRoots.push(projectRoot)
		fs.mkdirSync(path.join(projectRoot, "src"), { recursive: true })
		writeEnvFile(projectRoot, ".env", "MAGIC_ENV_OVERLAY_SHARED=base\n")
		writeEnvFile(projectRoot, "enterprise/.env", "MAGIC_ENV_OVERLAY_SHARED=enterprise\n")

		const result = loadLayeredEnvFiles({ projectRoot, mode: "development", processEnv: {} })

		expect(result.env.MAGIC_ENV_OVERLAY_SHARED).toBe("base")
		expect(result.files[0]?.layer).toBe("base")
	})
})
