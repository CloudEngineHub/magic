/**
 * Runtime plugin registry
 *
 * Runtime 只识别最小插件契约，不感知具体插件来源。外部组合层负责将
 * [PluginA, PluginB] 注册进来，runtime 启动时逐个安装并隔离单个插件异常。
 */

import { runtimeLoggerHub } from "./RuntimeLogger"

export interface RuntimePlugin {
	install(): void
}

export type RuntimePluginClass = new () => RuntimePlugin

const registeredPlugins: RuntimePluginClass[] = []
let hasInstalledRuntimePlugins = false
const installedPluginKeySet = new Set<string>()
const registryLogger = runtimeLoggerHub.createLogger("RuntimePluginRegistry")

function getPluginName(Plugin: RuntimePluginClass): string {
	return Plugin.name || "AnonymousRuntimePlugin"
}

function getPluginKey(Plugin: RuntimePluginClass): string {
	const pluginWithId = Plugin as RuntimePluginClass & { pluginId?: string }
	return pluginWithId.pluginId || getPluginName(Plugin)
}

function serializeInstallError(error: unknown): Record<string, unknown> {
	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
			stack: error.stack,
		}
	}
	return { message: String(error) }
}

function installRuntimePlugin(Plugin: RuntimePluginClass): boolean {
	const pluginName = getPluginName(Plugin)
	try {
		new Plugin().install()
		registryLogger.info("plugin:installed", { plugin: pluginName })
		return true
	} catch (error) {
		registryLogger.error("plugin:install-failed", {
			plugin: pluginName,
			error: serializeInstallError(error),
		})
		return false
	}
}

function upsertRegisteredPlugin(Plugin: RuntimePluginClass): void {
	const pluginKey = getPluginKey(Plugin)
	const existingIndex = registeredPlugins.findIndex(
		(RegisteredPlugin) => getPluginKey(RegisteredPlugin) === pluginKey,
	)

	if (existingIndex >= 0) {
		registeredPlugins[existingIndex] = Plugin
		return
	}

	registeredPlugins.push(Plugin)
}

export function registerRuntimePlugins(plugins: RuntimePluginClass[]): void {
	const pluginsToInstall: RuntimePluginClass[] = []
	const installKeySet = new Set<string>()

	for (const Plugin of plugins) {
		const pluginKey = getPluginKey(Plugin)
		upsertRegisteredPlugin(Plugin)

		if (!hasInstalledRuntimePlugins || installKeySet.has(pluginKey)) continue
		installKeySet.add(pluginKey)
		pluginsToInstall.push(Plugin)
	}

	// Dynamic content documents register their Magic API prelude after the shell
	// runtime has started, so late registration must install immediately.
	for (const Plugin of pluginsToInstall) {
		if (installRuntimePlugin(Plugin)) {
			installedPluginKeySet.add(getPluginKey(Plugin))
		}
	}
}

export function installRegisteredRuntimePlugins(): void {
	if (typeof window === "undefined") return

	hasInstalledRuntimePlugins = true
	const installedKeySet = new Set<string>()
	for (const Plugin of registeredPlugins) {
		const pluginKey = getPluginKey(Plugin)
		if (installedPluginKeySet.has(pluginKey) || installedKeySet.has(pluginKey)) continue
		installedKeySet.add(pluginKey)
		if (installRuntimePlugin(Plugin)) {
			installedPluginKeySet.add(pluginKey)
		}
	}
}
