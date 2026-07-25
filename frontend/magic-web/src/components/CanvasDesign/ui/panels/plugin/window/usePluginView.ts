import { useMemo } from "react"

import { resolvePluginIcon, resolvePluginText } from "../../../../runtime/plugins/resolve"
import type { CanvasDesignPlugin } from "../../../../runtime/document/types"
import { createPluginSrcDoc } from "./createPluginSrcDoc"
import type { PluginView } from "./types"

export function usePluginView(
	plugin: CanvasDesignPlugin,
	locale: string,
	channelToken: string,
	readonly: boolean,
): PluginView {
	return useMemo(
		() => ({
			label: resolvePluginText(plugin, plugin.label, locale),
			description: resolvePluginText(plugin, plugin.description, locale),
			icon: resolvePluginIcon(plugin),
			srcDoc: createPluginSrcDoc(plugin, locale, channelToken, { readonly }),
		}),
		[channelToken, locale, plugin, readonly],
	)
}
