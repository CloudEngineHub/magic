import { createRequire } from "node:module"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

const require = createRequire(import.meta.url)

describe("build plan", () => {
	let buildScript: any

	beforeEach(() => {
		vi.resetModules()
		delete require.cache[require.resolve("../build.cjs")]
		buildScript = require("../build.cjs")
	})

	it("loads edition-specific build.step.cjs through overlay selection", () => {
		const projectRoot = mkdtempSync(join(tmpdir(), "magic-build-step-"))
		try {
			mkdirSync(join(projectRoot, "scripts"), { recursive: true })
			mkdirSync(join(projectRoot, "enterprise/scripts"), { recursive: true })
			writeFileSync(
				join(projectRoot, "scripts/build.step.cjs"),
				`module.exports = [{ id: "base:oss-only", name: "OSS only", command: "oss" }]\n`,
			)
			writeFileSync(
				join(projectRoot, "enterprise/scripts/build.step.cjs"),
				`module.exports = [{ id: "enterprise:commercial-only", name: "Commercial only", command: "commercial" }]\n`,
			)

			const openSourcePlan = buildScript.createBuildPlan({
				edition: "opensource",
				projectRoot,
			})
			const enterprisePlan = buildScript.createBuildPlan({
				edition: "enterprise",
				projectRoot,
				envRef: { NODE_OPTIONS: "--trace-warnings" },
			})

			expect(openSourcePlan.map((step: any) => step.id)).toEqual([
				"base:oss-only",
				"base:vite-build",
			])
			expect(enterprisePlan.map((step: any) => step.id)).toEqual([
				"enterprise:commercial-only",
				"base:vite-build",
			])
			expect(enterprisePlan.at(-1)).toMatchObject({
				id: "base:vite-build",
				command: "vite",
				args: ["build"],
			})
			expect(enterprisePlan.at(-1).options.env).toMatchObject({
				EDITION: "enterprise",
				NODE_OPTIONS: "--trace-warnings --max-old-space-size=16384",
			})
		} finally {
			rmSync(projectRoot, { recursive: true, force: true })
		}
	})

	it("keeps explicit build step array order", () => {
		const plan = buildScript.createBuildPlan({
			edition: "opensource",
			buildSteps: [
				{ id: "base:second", name: "Second declared", command: "second" },
				{ id: "base:first", name: "First declared", command: "first" },
			],
		})

		expect(plan.map((step: any) => step.id)).toEqual([
			"base:second",
			"base:first",
			"base:vite-build",
		])
	})

	it("runs plan steps in the same order that it prints them", async () => {
		const writeStep = vi.fn()
		const writeStepResult = vi.fn()
		const controller = {
			isShutdownRequested: vi.fn(() => false),
			runCommand: vi.fn().mockResolvedValue(undefined),
		}
		const plan = [
			{ id: "base:first", name: "First task", command: "first", args: [], quiet: true },
			{ id: "base:second", name: "Second task", command: "second", args: ["--flag"] },
		]

		await buildScript.runBuildPlan(controller, plan, { writeStep, writeStepResult })

		expect(writeStep).toHaveBeenNthCalledWith(1, "[1/2] First task...")
		expect(writeStep).toHaveBeenNthCalledWith(2, "[2/2] Second task...")
		expect(controller.runCommand.mock.calls.map((call: any[]) => call.slice(0, 3))).toEqual([
			["[1/2] First task", "first", []],
			["[2/2] Second task", "second", ["--flag"]],
		])
		expect(writeStepResult).toHaveBeenCalledTimes(2)
	})
})
