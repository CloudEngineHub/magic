export const PLUGIN_STORAGE_KEY_PREFIX = "magic-canvas:plugin:"
export const PLUGIN_SHARED_GENERATION_CONFIG_STORAGE_KEY =
	"magic-canvas:plugin-shared:generation-config"

export function resolvePluginStorageKey(pluginName: string, key: string): string {
	const normalizedPluginName = pluginName.trim()
	if (!normalizedPluginName) {
		throw new Error("Plugin name is required for namespaced storage access.")
	}

	const normalizedKey = key.trim()
	if (!normalizedKey) {
		throw new Error("Plugin storage key is required.")
	}
	if (normalizedKey.startsWith(PLUGIN_STORAGE_KEY_PREFIX)) {
		throw new Error("Plugin storage keys must not include the host storage prefix.")
	}

	return `${PLUGIN_STORAGE_KEY_PREFIX}${normalizedPluginName}:${normalizedKey}`
}

export function resolveSharedGenerationConfigStorageKey(): string {
	return PLUGIN_SHARED_GENERATION_CONFIG_STORAGE_KEY
}
