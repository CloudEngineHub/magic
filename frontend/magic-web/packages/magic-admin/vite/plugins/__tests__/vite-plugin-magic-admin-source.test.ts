import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { Plugin } from "vite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import vitePluginMagicAdminSource from "../vite-plugin-magic-admin-source"

const tempRoots: string[] = []
const originalEdition = process.env.EDITION

function createTempProjectRoot() {
	const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "magic-admin-source-"))
	tempRoots.push(projectRoot)
	return projectRoot
}

function writeProjectFile(projectRoot: string, relativePath: string, content = relativePath) {
	const filePath = path.join(projectRoot, relativePath)
	fs.mkdirSync(path.dirname(filePath), { recursive: true })
	fs.writeFileSync(filePath, content, "utf8")
	return filePath
}

function callResolveId(plugin: Plugin, source: string, importer?: string) {
	const hook = plugin.resolveId
	if (!hook) return null
	if (typeof hook === "function")
		return hook.call({} as never, source, importer, { isEntry: false })
	return hook.handler.call({} as never, source, importer, { isEntry: false })
}

beforeEach(() => {
	process.env.EDITION = "enterprise"
})

afterEach(() => {
	process.env.EDITION = originalEdition
	for (const tempRoot of tempRoots.splice(0)) {
		fs.rmSync(tempRoot, {
			recursive: true,
			force: true,
		})
	}
})

describe("vitePluginMagicAdminSource", () => {
	it("prefers customer source files over enterprise and baseline files", () => {
		const projectRoot = createTempProjectRoot()
		writeProjectFile(
			projectRoot,
			"packages/magic-admin/src/provider/AdminProvider.tsx",
			"source",
		)
		writeProjectFile(
			projectRoot,
			"packages/magic-admin/enterprise/src/provider/AdminProvider.tsx",
			"enterprise",
		)
		const customerProviderPath = writeProjectFile(
			projectRoot,
			"packages/magic-admin/customer/src/provider/AdminProvider.tsx",
			"customer",
		)

		const plugin = vitePluginMagicAdminSource({ projectRoot })

		expect(callResolveId(plugin, "@admin/provider/AdminProvider")).toBe(customerProviderPath)
		expect(callResolveId(plugin, "@dtyq/magic-admin/provider")).toBe(customerProviderPath)
	})

	it("resolves explicit customer-only imports from the customer layer", () => {
		const projectRoot = createTempProjectRoot()
		const customerFeaturePath = writeProjectFile(
			projectRoot,
			"packages/magic-admin/customer/src/features/customer-only.ts",
			"customer-only",
		)

		const plugin = vitePluginMagicAdminSource({ projectRoot })

		expect(callResolveId(plugin, "@admin-customer/features/customer-only")).toBe(
			customerFeaturePath,
		)
	})
})
