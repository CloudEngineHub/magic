import { createRequire } from "node:module"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

const require = createRequire(import.meta.url)
const gitHooks = require("../install-git-hooks.cjs")

type SpawnResult = {
	status: number
	stdout?: string
	stderr?: string
	error?: Error
}

type SpawnCall = {
	command: string
	args: string[]
	options: {
		cwd?: string
		encoding?: string
		stdio?: string
	}
}

function createSpawnSyncRef(results: SpawnResult[]) {
	const calls: SpawnCall[] = []
	const spawnSyncRef = vi.fn((command: string, args: string[], options: SpawnCall["options"]) => {
		calls.push({ command, args, options })
		return results.shift() ?? { status: 0 }
	})

	return { calls, spawnSyncRef }
}

function createTempRepo() {
	const gitRoot = fs.mkdtempSync(path.join(os.tmpdir(), "magic-web-hooks-"))
	const projectDir = path.join(gitRoot, "frontend", "magic-web")
	const hooksDir = path.join(gitRoot, ".git", "hooks")

	fs.mkdirSync(path.join(projectDir, ".husky"), { recursive: true })
	fs.mkdirSync(hooksDir, { recursive: true })

	return { gitRoot, hooksDir, projectDir }
}

function createStandaloneTempRepo() {
	const gitRoot = fs.mkdtempSync(path.join(os.tmpdir(), "magic-web-standalone-hooks-"))
	const projectDir = gitRoot
	const hooksDir = path.join(gitRoot, ".git", "hooks")

	fs.mkdirSync(path.join(projectDir, ".husky"), { recursive: true })
	fs.mkdirSync(hooksDir, { recursive: true })

	return { gitRoot, hooksDir, projectDir }
}

function readHook(hooksDir: string, hookName: string) {
	return fs.readFileSync(path.join(hooksDir, hookName), "utf8")
}

afterEach(() => {
	vi.restoreAllMocks()
})

describe("install git hooks script", () => {
	it("installs local .git/hooks bridge scripts without configuring core.hooksPath", () => {
		const { gitRoot, hooksDir, projectDir } = createTempRepo()
		const { calls, spawnSyncRef } = createSpawnSyncRef([
			{ status: 0, stdout: `${gitRoot}\n` },
			{ status: 1, stdout: "" },
			{ status: 0, stdout: `${hooksDir}\n` },
		])
		const controller = gitHooks.createInstallGitHooksController({
			cwd: projectDir,
			projectDir,
			spawnSyncRef,
		})

		const result = controller.install()

		expect(result).toEqual({
			status: "configured",
			hooksDir,
			projectRelativeDir: "frontend/magic-web",
			installedHooks: ["pre-commit", "commit-msg", "pre-merge-commit"],
		})
		expect(calls).toEqual([
			{
				command: "git",
				args: ["rev-parse", "--show-toplevel"],
				options: { cwd: projectDir, encoding: "utf8" },
			},
			{
				command: "git",
				args: ["config", "--local", "--get", "core.hooksPath"],
				options: { cwd: gitRoot, encoding: "utf8", stdio: "pipe" },
			},
			{
				command: "git",
				args: ["rev-parse", "--git-path", "hooks"],
				options: { cwd: gitRoot, encoding: "utf8" },
			},
		])
		expect(
			calls.some(
				(call) => call.args.includes("core.hooksPath") && call.args.includes("--set"),
			),
		).toBe(false)
		expect(readHook(hooksDir, "pre-commit")).toContain(
			"magic_web_project_dir=\"$magic_web_git_root\"/'frontend/magic-web'",
		)
		expect(readHook(hooksDir, "pre-commit")).toContain(
			"$magic_web_project_dir/.husky/pre-commit",
		)
		expect(readHook(hooksDir, "pre-commit")).toContain(
			'git -C "$magic_web_git_root" diff --cached',
		)
		expect(readHook(hooksDir, "commit-msg")).toContain(
			"$magic_web_project_dir/.husky/commit-msg",
		)
		expect(readHook(hooksDir, "pre-merge-commit")).toContain(
			"$magic_web_project_dir/.husky/pre-merge-commit",
		)
	})

	it("installs standalone repository bridges without frontend/magic-web path assumptions", () => {
		const { gitRoot, hooksDir, projectDir } = createStandaloneTempRepo()
		const { spawnSyncRef } = createSpawnSyncRef([
			{ status: 0, stdout: `${gitRoot}\n` },
			{ status: 1, stdout: "" },
			{ status: 0, stdout: `${hooksDir}\n` },
		])
		const controller = gitHooks.createInstallGitHooksController({
			cwd: projectDir,
			projectDir,
			spawnSyncRef,
		})

		const result = controller.install()

		expect(result).toMatchObject({ status: "configured", projectRelativeDir: "." })
		expect(readHook(hooksDir, "pre-commit")).toContain(
			'magic_web_project_dir="$magic_web_git_root"',
		)
		expect(readHook(hooksDir, "pre-commit")).toContain(
			"$magic_web_project_dir/.husky/pre-commit",
		)
		expect(readHook(hooksDir, "pre-commit")).not.toContain("frontend/magic-web")
		expect(readHook(hooksDir, "commit-msg")).toContain(
			'magic_web_project_dir="$magic_web_git_root"',
		)
		expect(readHook(hooksDir, "commit-msg")).toContain(
			"$magic_web_project_dir/.husky/commit-msg",
		)
		expect(readHook(hooksDir, "commit-msg")).not.toContain("frontend/magic-web")
	})

	it("updates an existing managed block without replacing user hook content", () => {
		const { gitRoot, hooksDir, projectDir } = createTempRepo()
		const existingHook = path.join(hooksDir, "pre-commit")
		fs.writeFileSync(
			existingHook,
			[
				"#!/usr/bin/env sh",
				"echo user-hook-before",
				gitHooks.BRIDGE_BEGIN_MARKER,
				"echo stale-managed-block",
				gitHooks.BRIDGE_END_MARKER,
				"echo user-hook-after",
				"",
			].join("\n"),
			{ mode: 0o755 },
		)
		const { spawnSyncRef } = createSpawnSyncRef([
			{ status: 0, stdout: `${gitRoot}\n` },
			{ status: 1, stdout: "" },
			{ status: 0, stdout: `${hooksDir}\n` },
		])
		const controller = gitHooks.createInstallGitHooksController({
			cwd: projectDir,
			projectDir,
			spawnSyncRef,
		})

		controller.install()

		const hookContent = readHook(hooksDir, "pre-commit")
		expect(hookContent).toContain("echo user-hook-before")
		expect(hookContent).toContain("echo user-hook-after")
		expect(hookContent).not.toContain("echo stale-managed-block")
		expect(hookContent.match(new RegExp(gitHooks.BRIDGE_BEGIN_MARKER, "g"))).toHaveLength(1)
	})

	it("unsets the previous magic-web managed core.hooksPath before installing .git/hooks", () => {
		const { gitRoot, hooksDir, projectDir } = createTempRepo()
		const { calls, spawnSyncRef } = createSpawnSyncRef([
			{ status: 0, stdout: `${gitRoot}\n` },
			{ status: 0, stdout: "frontend/magic-web/.husky/_\n" },
			{ status: 0 },
			{ status: 0, stdout: `${hooksDir}\n` },
		])
		const controller = gitHooks.createInstallGitHooksController({
			cwd: projectDir,
			projectDir,
			spawnSyncRef,
		})

		const result = controller.install()

		expect(result.status).toBe("configured")
		expect(calls[2]).toMatchObject({
			command: "git",
			args: ["config", "--local", "--unset", "core.hooksPath"],
			options: { cwd: gitRoot },
		})
	})

	it("skips bridge installation when a custom hooksPath is already configured", () => {
		const { gitRoot, projectDir } = createTempRepo()
		const { calls, spawnSyncRef } = createSpawnSyncRef([
			{ status: 0, stdout: `${gitRoot}\n` },
			{ status: 0, stdout: "../custom-hooks\n" },
		])
		const controller = gitHooks.createInstallGitHooksController({
			cwd: projectDir,
			projectDir,
			spawnSyncRef,
		})

		const result = controller.install()

		expect(result).toEqual({
			status: "skipped",
			reason: "custom-hooks-path",
			hooksPath: "../custom-hooks",
		})
		expect(calls).toHaveLength(2)
	})

	it("skips before touching git when hooks are disabled for the environment", () => {
		const { calls, spawnSyncRef } = createSpawnSyncRef([])
		const controller = gitHooks.createInstallGitHooksController({
			cwd: "/repo/frontend/magic-web",
			env: { HUSKY: "0" },
			spawnSyncRef,
		})

		const result = controller.install()

		expect(result).toEqual({ status: "skipped", reason: "disabled" })
		expect(calls).toHaveLength(0)
	})
})
