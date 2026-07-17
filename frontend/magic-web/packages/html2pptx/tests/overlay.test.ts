import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { Plugin, PluginOption, UserConfig } from "vite"
import { afterEach, describe, expect, it } from "vitest"
import { mergeLayerConfigs, resolveLayerConfigs, type LayerConfig } from "../vite/layers"
import { getOverlayViteConfig } from "../vite/overlay"

const tempRoots: string[] = []

function createTempProject(): string {
	const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "html2pptx-overlay-"))
	tempRoots.push(projectRoot)
	writeProjectFile({ projectRoot, relativePath: "src/index.ts" })
	return projectRoot
}

function writeProjectFile({
	projectRoot,
	relativePath,
	content = "export const value = true\n",
}: {
	projectRoot: string
	relativePath: string
	content?: string
}): string {
	const filePath = path.join(projectRoot, relativePath)
	fs.mkdirSync(path.dirname(filePath), { recursive: true })
	fs.writeFileSync(filePath, content, "utf8")
	return filePath
}

function flattenPlugins(options: PluginOption[] | undefined): Plugin[] {
	const plugins: Plugin[] = []
	for (const option of options ?? []) {
		if (!option || typeof option === "boolean") continue
		if (Array.isArray(option)) {
			plugins.push(...flattenPlugins(option))
			continue
		}
		if (typeof option === "object" && "then" in option) continue
		plugins.push(option as Plugin)
	}
	return plugins
}

function getPlugin(config: UserConfig, name: string): Plugin {
	const plugin = flattenPlugins(config.plugins).find((candidate) => candidate.name === name)
	if (!plugin) throw new Error(`${name} plugin is required`)
	return plugin
}

function getResolveId(plugin: Plugin) {
	if (!plugin.resolveId) throw new Error(`${plugin.name} resolveId hook is required`)
	return typeof plugin.resolveId === "function" ? plugin.resolveId : plugin.resolveId.handler
}

function getConfig(plugin: Plugin) {
	if (!plugin.config) throw new Error(`${plugin.name} config hook is required`)
	return typeof plugin.config === "function" ? plugin.config : plugin.config.handler
}

afterEach(() => {
	for (const tempRoot of tempRoots.splice(0)) {
		fs.rmSync(tempRoot, { recursive: true, force: true })
	}
})

describe("html2pptx filesystem-driven Overlay architecture", () => {
	it("activates layers from folder shape without an edition environment variable", () => {
		const projectRoot = createTempProject()
		const baseConfig = getOverlayViteConfig({ projectRoot })

		expect(baseConfig.cacheDir).toBe(path.join(projectRoot, "node_modules/.vite/base"))
		expect(
			flattenPlugins(baseConfig.plugins).some(
				(plugin) => plugin.name === "vite-plugin-overlay:src",
			),
		).toBe(false)
		expect(
			flattenPlugins(baseConfig.plugins).some(
				(plugin) => plugin.name === "vite-plugin-overlay:worker",
			),
		).toBe(false)

		writeProjectFile({ projectRoot, relativePath: "enterprise/src/index.ts" })
		writeProjectFile({ projectRoot, relativePath: "customer/src/index.ts" })
		const layeredConfig = getOverlayViteConfig({ projectRoot })

		expect(layeredConfig.cacheDir).toBe(
			path.join(projectRoot, "node_modules/.vite/base-enterprise-customer"),
		)
		expect(
			flattenPlugins(layeredConfig.plugins).some(
				(plugin) => plugin.name === "vite-plugin-overlay:src",
			),
		).toBe(true)
		expect(
			flattenPlugins(layeredConfig.plugins).some(
				(plugin) => plugin.name === "vite-plugin-overlay:worker",
			),
		).toBe(true)
	})

	it("merges config contributions in baseline-to-customer order", () => {
		const projectRoot = createTempProject()
		writeProjectFile({
			projectRoot,
			relativePath: "vite/config.cjs",
			content: "module.exports = () => ({ define: { __LAYER__: 'base' } })\n",
		})
		writeProjectFile({
			projectRoot,
			relativePath: "enterprise/vite/config.cjs",
			content: "module.exports = () => ({ define: { __LAYER__: 'enterprise' } })\n",
		})

		const descriptors: LayerConfig[] = [
			{ name: "base", rootDir: ".", configFile: "vite/config.cjs", sourceDir: "src" },
			{
				name: "enterprise",
				rootDir: "enterprise",
				configFile: "vite/config.cjs",
				sourceDir: "src",
			},
		]
		const layers = resolveLayerConfigs({ projectRoot, layers: descriptors })

		expect(mergeLayerConfigs({ projectRoot, layers }).define?.__LAYER__).toBe("enterprise")
	})

	it("lets the unified source Overlay resolve the highest active layer", async () => {
		const projectRoot = createTempProject()
		writeProjectFile({ projectRoot, relativePath: "enterprise/src/features/panel.ts" })
		const customerFile = writeProjectFile({
			projectRoot,
			relativePath: "customer/src/features/panel.ts",
		})
		const sourcePlugin = getPlugin(
			getOverlayViteConfig({ projectRoot }),
			"vite-plugin-overlay:src",
		)

		const resolved = await getResolveId(sourcePlugin).call(
			{} as never,
			"@/features/panel",
			undefined,
			{} as never,
		)

		expect(resolved).toBe(customerFile)
	})

	it("installs the same source Overlay in Vite Worker plugin containers", async () => {
		const projectRoot = createTempProject()
		writeProjectFile({ projectRoot, relativePath: "enterprise/src/workers/image-worker.ts" })
		const customerWorker = writeProjectFile({
			projectRoot,
			relativePath: "customer/src/workers/image-worker.ts",
		})
		const workerAdapter = getPlugin(
			getOverlayViteConfig({ projectRoot }),
			"vite-plugin-overlay:worker",
		)
		const workerConfig = (await getConfig(workerAdapter).call(
			{} as never,
			{} as never,
			{} as never,
		)) as UserConfig
		const workerSourcePlugin = flattenPlugins(workerConfig.worker?.plugins?.()).find(
			(plugin) => plugin.name === "vite-plugin-overlay:src",
		)
		if (!workerSourcePlugin) throw new Error("Worker source Overlay plugin is required")

		const resolved = await getResolveId(workerSourcePlugin).call(
			{} as never,
			"@/workers/image-worker",
			undefined,
			{} as never,
		)

		expect(resolved).toBe(customerWorker)
	})
})
