import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { Plugin, UserConfig } from "vite"
import { afterEach, describe, expect, it } from "vitest"
import vitePluginOverlay from "../vite-plugin-overlay"

const tempRoots: string[] = []

function createTempProject() {
	const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "magic-overlay-"))
	tempRoots.push(projectRoot)
	return projectRoot
}

function writeProjectFile(projectRoot: string, relativePath: string, content = "content") {
	const filePath = path.join(projectRoot, relativePath)
	fs.mkdirSync(path.dirname(filePath), { recursive: true })
	fs.writeFileSync(filePath, content, "utf8")
	return filePath
}

function getPlugins(projectRoot: string): Plugin[] {
	return vitePluginOverlay({
		projectRoot,
		layers: [
			{
				name: "base",
				rootPath: path.join(projectRoot, "base"),
				sourceDir: "src",
				reloadOnChange: false,
			},
			{ name: "team", rootPath: path.join(projectRoot, "team"), sourceDir: "src" },
			{
				name: "private",
				rootPath: path.join(projectRoot, "private"),
				sourceDir: "src",
			},
		],
	}) as Plugin[]
}

function findPlugin(plugins: Plugin[], name: string): Plugin {
	const plugin = plugins.find((candidate) => candidate.name === name)
	if (!plugin) throw new Error(`${name} plugin is required`)
	return plugin
}

function createOverlayResolver(projectRoot: string) {
	const sourcePlugin = findPlugin(getPlugins(projectRoot), "vite-plugin-overlay:src")
	const resolveIdHook = getResolveIdHook(sourcePlugin)
	return (source: string, importer?: string) =>
		resolveIdHook.call({} as never, source, importer, {} as never)
}

function getResolveIdHook(plugin: Plugin) {
	const resolveIdHook = plugin.resolveId
	if (typeof resolveIdHook === "function") return resolveIdHook
	if (resolveIdHook && typeof resolveIdHook.handler === "function") {
		return resolveIdHook.handler
	}
	throw new Error("resolveId hook is required")
}

function getConfigFromOverlayPlugin(plugins: Plugin[]): UserConfig {
	const configPlugin = findPlugin(plugins, "vite-plugin-overlay:config")
	const configHook = configPlugin.config as unknown as () => UserConfig
	if (!configHook) throw new Error("config hook is required")
	return configHook.call({} as never)
}

function loadVirtualHtml(plugin: Plugin, virtualPath: string): unknown {
	const loadHook = plugin.load as unknown as (id: string) => unknown
	return loadHook.call({} as never, virtualPath)
}

afterEach(() => {
	for (const tempRoot of tempRoots.splice(0)) {
		fs.rmSync(tempRoot, { recursive: true, force: true })
	}
})

describe("vitePluginOverlay", () => {
	it("routes source imports through the unified overlay plugin", () => {
		const projectRoot = createTempProject()
		writeProjectFile(projectRoot, "base/src/features/panel.ts")
		writeProjectFile(projectRoot, "team/src/features/panel.ts")
		const privateFile = writeProjectFile(projectRoot, "private/src/features/panel.ts")

		const resolveId = createOverlayResolver(projectRoot)

		expect(resolveId("@/features/panel")).toBe(privateFile)
	})

	it("routes root HTML entries through the same overlay plugin entrypoint", () => {
		const projectRoot = createTempProject()
		writeProjectFile(projectRoot, "base/index.html", "base-index")
		const overlayIndex = writeProjectFile(projectRoot, "team/index.html", "team-index")
		writeProjectFile(projectRoot, "private/shared.html", "private-shared")

		const plugins = getPlugins(projectRoot)
		const config = getConfigFromOverlayPlugin(plugins)
		const input = config.build?.rolldownOptions?.input as Record<string, string>

		const virtualIndex = path.resolve(projectRoot, "index.html")
		expect(input.index).toBe(virtualIndex)
		expect(input.shared).toBe(path.resolve(projectRoot, "shared.html"))
		expect(config.root).toBe(projectRoot)
		expect(config.optimizeDeps?.entries).toContain(overlayIndex)

		const htmlPlugin = findPlugin(plugins, "vite-plugin-overlay:html")
		expect(loadVirtualHtml(htmlPlugin, virtualIndex)).toBe("team-index")
		expect(loadVirtualHtml(htmlPlugin, path.resolve(projectRoot, "shared.html"))).toBe(
			"private-shared",
		)
	})
})
