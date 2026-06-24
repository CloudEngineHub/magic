import { useSyncExternalStore } from "react"

import { normalizePluginLocale } from "../../canvas/plugins/resolve"
import { useCanvas } from "../../context/CanvasContext"
import { useHostUiLocale } from "../../context/HostUiLocaleContext"
import { noop } from "./constants"
import { createPluginSrcDoc } from "./createPluginSrcDoc"
import { PluginWindow } from "./PluginWindow"

export { createPluginSrcDoc }

export default function PluginPanel() {
	const { canvas } = useCanvas()
	const hostUiLocale = useHostUiLocale()
	const snapshot = useSyncExternalStore(
		(listener) => canvas?.pluginManager.subscribe(listener) ?? noop,
		() => canvas?.pluginManager.getSnapshot(),
		() => undefined,
	)

	const locale = normalizePluginLocale(hostUiLocale)
	const plugin = snapshot?.activePlugin ?? null

	if (!canvas || !plugin) return null

	return (
		<PluginWindow
			key={`${plugin.name}-${snapshot?.sessionId ?? 0}`}
			canvas={canvas}
			locale={locale}
			plugin={plugin}
			sessionId={snapshot?.sessionId ?? 0}
		/>
	)
}
