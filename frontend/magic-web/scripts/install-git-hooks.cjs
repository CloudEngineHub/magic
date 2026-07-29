#!/usr/bin/env node

const { spawnSync } = require("child_process")
const fs = require("fs")
const path = require("path")

const BRIDGE_BEGIN_MARKER = "# magic-web git hook bridge: begin"
const BRIDGE_END_MARKER = "# magic-web git hook bridge: end"
// These values were written by earlier magic-web hook installers. They can be
// removed safely so the repo falls back to its default .git/hooks entrypoints.
const PREVIOUS_MANAGED_HOOKS_PATHS = new Set(["frontend/magic-web/.husky/_", ".husky/_"])

function isHooksInstallDisabled(env = process.env) {
	return env.HUSKY === "0" || env.CI === "true" || env.CI === "1"
}

function runSpawn(spawnSyncRef, command, args, options) {
	return spawnSyncRef(command, args, {
		encoding: "utf8",
		...options,
	})
}

function readGitRoot({ cwd, spawnSyncRef }) {
	const result = runSpawn(spawnSyncRef, "git", ["rev-parse", "--show-toplevel"], { cwd })

	if (result.status !== 0 || result.error || !result.stdout) {
		return null
	}

	return result.stdout.trim()
}

function readLocalHooksPath({ gitRoot, spawnSyncRef }) {
	// A custom hooksPath means Git will ignore .git/hooks. We detect it before
	// installing the bridge so we do not silently override another hook system.
	const result = runSpawn(spawnSyncRef, "git", ["config", "--local", "--get", "core.hooksPath"], {
		cwd: gitRoot,
		stdio: "pipe",
	})

	if (result.status !== 0 || result.error || !result.stdout) {
		return ""
	}

	return result.stdout.trim()
}

function unsetPreviousManagedHooksPath({ gitRoot, hooksPath, spawnSyncRef }) {
	if (!PREVIOUS_MANAGED_HOOKS_PATHS.has(hooksPath)) {
		return { ok: true, didUnset: false }
	}

	const result = runSpawn(
		spawnSyncRef,
		"git",
		["config", "--local", "--unset", "core.hooksPath"],
		{
			cwd: gitRoot,
			stdio: "pipe",
		},
	)

	if (result.status !== 0 || result.error) {
		return {
			ok: false,
			error: result.stderr || result.error?.message,
		}
	}

	return { ok: true, didUnset: true }
}

function readGitHooksDir({ gitRoot, spawnSyncRef }) {
	const result = runSpawn(spawnSyncRef, "git", ["rev-parse", "--git-path", "hooks"], {
		cwd: gitRoot,
	})

	if (result.status !== 0 || result.error || !result.stdout) {
		return path.join(gitRoot, ".git", "hooks")
	}

	const hooksPath = result.stdout.trim()
	return path.isAbsolute(hooksPath) ? hooksPath : path.join(gitRoot, hooksPath)
}

function toGitPath(filePath) {
	return filePath.split(path.sep).join("/")
}

function getProjectRelativeDir({ gitRoot, projectDir }) {
	// In the magic monorepo this resolves to "frontend/magic-web"; in a
	// standalone magic-web repository it resolves to ".".
	const relativeDir = toGitPath(path.relative(gitRoot, projectDir))
	return relativeDir || "."
}

function shellSingleQuote(value) {
	return `'${String(value).replace(/'/g, "'\\''")}'`
}

function escapeBasicGrepPattern(value) {
	return value.replace(/[.[\]\\^$*]/g, "\\$&")
}

function createProjectDirLine(projectRelativeDir) {
	if (projectRelativeDir === ".") {
		return '\tmagic_web_project_dir="$magic_web_git_root"'
	}

	return `\tmagic_web_project_dir="$magic_web_git_root"/${shellSingleQuote(projectRelativeDir)}`
}

function createStagedFilesCondition(projectRelativeDir) {
	// The bridge should only run magic-web checks when the staged set belongs to
	// this project. Standalone repositories treat any staged file as in-scope.
	const stagedFilesCommand =
		'git -C "$magic_web_git_root" diff --cached --name-only --diff-filter=ACMRD'

	if (projectRelativeDir === ".") {
		return `${stagedFilesCommand} | grep -q .`
	}

	const projectPrefixPattern = `^${escapeBasicGrepPattern(projectRelativeDir)}/`
	return `${stagedFilesCommand} | grep -q ${shellSingleQuote(projectPrefixPattern)}`
}

function createPreCommitBridgeBlock({ projectRelativeDir }) {
	// Git hooks are repo-level. This bridge keeps the repo's default .git/hooks
	// entrypoint and routes into magic-web only for relevant staged paths.
	return [
		BRIDGE_BEGIN_MARKER,
		'magic_web_git_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"',
		'if [ -n "$magic_web_git_root" ] && ' +
			createStagedFilesCondition(projectRelativeDir) +
			"; then",
		createProjectDirLine(projectRelativeDir),
		'\tmagic_web_hook="$magic_web_project_dir/.husky/pre-commit"',
		'\tif [ -f "$magic_web_hook" ]; then',
		'\t\tsh "$magic_web_hook" "$@" || exit $?',
		"\tfi",
		"fi",
		BRIDGE_END_MARKER,
		"",
	].join("\n")
}

function createCommitMsgBridgeBlock({ projectRelativeDir }) {
	// commit-msg receives a path argument from Git. Normalize it in the bridge
	// before delegating so the downstream hook can cd into the project safely.
	return [
		BRIDGE_BEGIN_MARKER,
		'magic_web_git_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"',
		'if [ -n "$magic_web_git_root" ] && ' +
			createStagedFilesCondition(projectRelativeDir) +
			"; then",
		createProjectDirLine(projectRelativeDir),
		'\tmagic_web_hook="$magic_web_project_dir/.husky/commit-msg"',
		'\tif [ -f "$magic_web_hook" ] && [ -n "$1" ]; then',
		'\t\tcase "$1" in',
		'\t\t\t/*) magic_web_commit_msg_file="$1" ;;',
		'\t\t\t*) magic_web_commit_msg_file="$magic_web_git_root/$1" ;;',
		"\t\tesac",
		'\t\tsh "$magic_web_hook" "$magic_web_commit_msg_file" || exit $?',
		"\tfi",
		"fi",
		BRIDGE_END_MARKER,
		"",
	].join("\n")
}

function createPreMergeCommitBridgeBlock({ projectRelativeDir }) {
	// Automatic merge commits invoke pre-merge-commit instead of pre-commit.
	return [
		BRIDGE_BEGIN_MARKER,
		'magic_web_git_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"',
		'if [ -n "$magic_web_git_root" ] && ' +
			createStagedFilesCondition(projectRelativeDir) +
			"; then",
		createProjectDirLine(projectRelativeDir),
		'\tmagic_web_hook="$magic_web_project_dir/.husky/pre-merge-commit"',
		'\tif [ -f "$magic_web_hook" ]; then',
		'\t\tsh "$magic_web_hook" "$@" || exit $?',
		"\tfi",
		"fi",
		BRIDGE_END_MARKER,
		"",
	].join("\n")
}

function ensureTrailingNewline(content) {
	return content.endsWith("\n") ? content : `${content}\n`
}

function upsertManagedBlock(existingContent, managedBlock) {
	if (!existingContent) {
		return `#!/usr/bin/env sh\n${managedBlock}`
	}

	// Preserve user-managed hook content and replace only our marked block, so a
	// re-run of setup:hooks is safe and idempotent.
	const beginIndex = existingContent.indexOf(BRIDGE_BEGIN_MARKER)
	const endIndex = existingContent.indexOf(BRIDGE_END_MARKER)

	if (beginIndex !== -1 && endIndex !== -1 && endIndex > beginIndex) {
		const afterEndIndex = endIndex + BRIDGE_END_MARKER.length
		const before = existingContent.slice(0, beginIndex)
		const after = existingContent.slice(afterEndIndex).replace(/^\n?/, "")

		return ensureTrailingNewline(`${before}${managedBlock}${after}`)
	}

	return `${ensureTrailingNewline(existingContent)}\n${managedBlock}`
}

function installHookBridge({ fsRef, hooksDir, hookName, managedBlock }) {
	const hookPath = path.join(hooksDir, hookName)
	const existingContent = fsRef.existsSync(hookPath) ? fsRef.readFileSync(hookPath, "utf8") : ""
	const nextContent = upsertManagedBlock(existingContent, managedBlock)

	fsRef.mkdirSync(hooksDir, { recursive: true })
	fsRef.writeFileSync(hookPath, nextContent, { mode: 0o755 })

	if (typeof fsRef.chmodSync === "function") {
		fsRef.chmodSync(hookPath, 0o755)
	}
}

function createInstallGitHooksController({
	cwd = process.cwd(),
	projectDir = cwd,
	env = process.env,
	fsRef = fs,
	spawnSyncRef = spawnSync,
} = {}) {
	const install = () => {
		if (isHooksInstallDisabled(env)) {
			return { status: "skipped", reason: "disabled" }
		}

		const gitRoot = readGitRoot({ cwd, spawnSyncRef })

		if (!gitRoot) {
			return { status: "skipped", reason: "not-git-repo" }
		}

		const hooksPath = readLocalHooksPath({ gitRoot, spawnSyncRef })

		if (hooksPath) {
			const unsetResult = unsetPreviousManagedHooksPath({ gitRoot, hooksPath, spawnSyncRef })

			if (!unsetResult.ok) {
				return {
					status: "skipped",
					reason: "unset-hooks-path-failed",
					error: unsetResult.error,
				}
			}

			if (!unsetResult.didUnset) {
				return {
					status: "skipped",
					reason: "custom-hooks-path",
					hooksPath,
				}
			}
		}

		const hooksDir = readGitHooksDir({ gitRoot, spawnSyncRef })
		const projectRelativeDir = getProjectRelativeDir({
			gitRoot,
			projectDir: path.resolve(projectDir),
		})

		// Write bridge scripts directly into .git/hooks instead of setting
		// core.hooksPath, which would move the hook entrypoint for the entire repo.
		installHookBridge({
			fsRef,
			hooksDir,
			hookName: "pre-commit",
			managedBlock: createPreCommitBridgeBlock({ projectRelativeDir }),
		})
		installHookBridge({
			fsRef,
			hooksDir,
			hookName: "commit-msg",
			managedBlock: createCommitMsgBridgeBlock({ projectRelativeDir }),
		})
		installHookBridge({
			fsRef,
			hooksDir,
			hookName: "pre-merge-commit",
			managedBlock: createPreMergeCommitBridgeBlock({ projectRelativeDir }),
		})

		return {
			status: "configured",
			hooksDir,
			projectRelativeDir,
			installedHooks: ["pre-commit", "commit-msg", "pre-merge-commit"],
		}
	}

	return {
		install,
	}
}

function main() {
	const projectDir = path.resolve(__dirname, "..")
	const controller = createInstallGitHooksController({
		cwd: process.cwd(),
		projectDir,
	})
	const result = controller.install()

	if (result.status === "configured") {
		console.log(
			`Git hook bridge installed: ${result.hooksDir} (project: ${result.projectRelativeDir})`,
		)
		return
	}

	if (result.reason === "custom-hooks-path") {
		console.log(`Git hook bridge skipped: custom core.hooksPath=${result.hooksPath}`)
		return
	}

	console.log(`Git hook bridge skipped: ${result.reason}`)
}

if (require.main === module) {
	main()
}

module.exports = {
	BRIDGE_BEGIN_MARKER,
	BRIDGE_END_MARKER,
	PREVIOUS_MANAGED_HOOKS_PATHS,
	createCommitMsgBridgeBlock,
	createInstallGitHooksController,
	createPreMergeCommitBridgeBlock,
	createProjectDirLine,
	createPreCommitBridgeBlock,
	createStagedFilesCondition,
	getProjectRelativeDir,
	installHookBridge,
	isHooksInstallDisabled,
	main,
	upsertManagedBlock,
}
