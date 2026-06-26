import type { CanvasDesignPlugin } from "../../canvas/types"
import { CANVAS_DESIGN_PLUGIN_RUNTIME_VERSION, createPluginSrcDocV1 } from "./runtime/v1"

export function createPluginSrcDoc(
	plugin: CanvasDesignPlugin,
	locale: string,
	channelToken: string,
	hostState: { readonly: boolean },
) {
	if (plugin.version === CANVAS_DESIGN_PLUGIN_RUNTIME_VERSION) {
		return createPluginSrcDocV1(plugin, locale, channelToken, hostState)
	}
	console.warn(
		`[PluginPanel] Unsupported plugin runtime version: ${plugin.version}.`,
		plugin.name,
	)
	return null
}
