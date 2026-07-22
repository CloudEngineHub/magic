import { useState, useSyncExternalStore } from "react"

import { normalizePluginLocale } from "../../../../runtime/plugins/resolve"
import { useCanvas } from "../../../../app/providers/CanvasProvider"
import { useHostUiLocale } from "../../../../app/providers/HostUiLocaleProvider"
import { noop, PLUGIN_WINDOW_DEFAULT_HEIGHT } from "./constants"
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
	// 高度提到父级，避免 PluginWindow 因 key remount 时重置为默认 360 造成弹变。
	const [frameHeight, setFrameHeight] = useState(PLUGIN_WINDOW_DEFAULT_HEIGHT)

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
			frameHeight={frameHeight}
			setFrameHeight={setFrameHeight}
		/>
	)
}
