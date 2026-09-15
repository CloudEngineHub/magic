#!/usr/bin/env node

/**
 * Prevent an overlay change from being hidden by a more specific layer.
 *
 * Source resolution is whole-file replacement (src -> enterprise/src ->
 * customer/src). Therefore an enterprise change must be accompanied by a
 * staged change to the same customer path whenever that customer override
 * already exists.
 */

const { spawnSync } = require("node:child_process")

const ENTERPRISE_PREFIX = "enterprise/src/"
const CUSTOMER_PREFIX = "customer/src/"

function splitGitNames(output) {
	return String(output ?? "")
		.split("\0")
		.filter((file) => file.length > 0)
}

function normalizeGitPath(file) {
	return String(file).replaceAll("\\", "/").replace(/^\.\//, "")
}

function findUnsyncedOverlayChanges({
	changedFiles,
	trackedCustomerFiles,
	enterprisePrefix = ENTERPRISE_PREFIX,
	customerPrefix = CUSTOMER_PREFIX,
}) {
	const changed = new Set(changedFiles.map(normalizeGitPath))
	const trackedCustomer = new Set(trackedCustomerFiles.map(normalizeGitPath))
	const issues = []

	for (const enterpriseFile of changed) {
		if (!enterpriseFile.startsWith(enterprisePrefix)) continue

		const relativePath = enterpriseFile.slice(enterprisePrefix.length)
		if (!relativePath) continue

		const customerFile = `${customerPrefix}${relativePath}`
		// A customer deletion is a valid synchronization: it removes the file
		// that would otherwise mask the enterprise implementation.
		if (!trackedCustomer.has(customerFile) || changed.has(customerFile)) continue

		issues.push({ enterpriseFile, customerFile })
	}

	return issues.sort((left, right) => left.enterpriseFile.localeCompare(right.enterpriseFile))
}

function runGit(spawnSyncRef, args, cwd) {
	const result = spawnSyncRef("git", args, { cwd, encoding: "utf8" })
	if (result.error || result.status !== 0) {
		const detail = result.error?.message || String(result.stderr || "").trim()
		throw new Error(`git ${args.join(" ")} failed${detail ? `: ${detail}` : ""}`)
	}
	return result.stdout
}

function checkOverlaySync({ cwd = process.cwd(), spawnSyncRef = spawnSync } = {}) {
	const changedFiles = splitGitNames(
		runGit(
			spawnSyncRef,
			["diff", "--cached", "--name-only", "--diff-filter=ACMRD", "-z", "--relative", "--"],
			cwd,
		),
	)
	const trackedCustomerFiles = splitGitNames(
		runGit(spawnSyncRef, ["ls-files", "--cached", "-z", "--", CUSTOMER_PREFIX], cwd),
	)
	const issues = findUnsyncedOverlayChanges({ changedFiles, trackedCustomerFiles })

	return { ok: issues.length === 0, changedFiles, trackedCustomerFiles, issues }
}

function printIssues(issues, output = console.error) {
	output("❌ Overlay synchronization check failed.")
	output(
		"The enterprise/src file(s) changed in this commit are shadowed by existing customer/src overrides.",
	)
	output(
		"Please manually synchronize the customer file(s), then stage them and retry the commit:",
	)
	for (const { enterpriseFile, customerFile } of issues) {
		output(`  ${enterpriseFile}  ->  ${customerFile}`)
	}
}

function main() {
	try {
		const result = checkOverlaySync()
		if (result.ok) return 0
		printIssues(result.issues)
		return 1
	} catch (error) {
		console.error(`❌ Unable to check overlay synchronization: ${error.message}`)
		return 2
	}
}

if (require.main === module) process.exitCode = main()

module.exports = {
	CUSTOMER_PREFIX,
	ENTERPRISE_PREFIX,
	checkOverlaySync,
	findUnsyncedOverlayChanges,
	main,
	printIssues,
	splitGitNames,
}
