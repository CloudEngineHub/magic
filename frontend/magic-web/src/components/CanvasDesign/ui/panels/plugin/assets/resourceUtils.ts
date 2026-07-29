import {
	isSafePluginRelativePath,
	resolvePluginPackagePath,
} from "../../../../runtime/plugins/resolve"
import type { CanvasDesignPlugin } from "../../../../runtime/document/types"

export async function resolvePluginResource(
	plugin: CanvasDesignPlugin,
	path: string,
): Promise<string> {
	if (!isSafePluginRelativePath(path)) {
		throw new Error(`Invalid plugin resource path: ${path}`)
	}
	if (plugin.resolveResourceUrl) {
		return plugin.resolveResourceUrl(path)
	}
	if (plugin.resourceBaseUrl) {
		return new URL(path, plugin.resourceBaseUrl).href
	}
	return resolvePluginPackagePath(plugin, path)
}

export function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message
	return String(error ?? "")
}
