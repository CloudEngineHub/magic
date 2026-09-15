import { useCallback, useRef, useState, useSyncExternalStore } from "react"
import { normalizePluginLocale } from "../../../../runtime/plugins/resolve"
import { useCanvas } from "../../../../app/providers/CanvasProvider"
import { useHostUiLocale } from "../../../../app/providers/HostUiLocaleProvider"
import { noop } from "./constants"
import { createPluginSrcDoc } from "./createPluginSrcDoc"
import { PluginWindow } from "./PluginWindow"
import {
	getCachedPluginPanelSize,
	getDefaultPluginPanelSize,
	saveCachedPluginPanelSize,
} from "./position"
import type { PluginWindowSize } from "./types"

export { createPluginSrcDoc }

export default function PluginPanel() {
	const { canvas } = useCanvas()
	const hostUiLocale = useHostUiLocale()
	const snapshot = useSyncExternalStore(
		(listener) => canvas?.pluginManager.subscribe(listener) ?? noop,
		() => canvas?.pluginManager.getSnapshot(),
		() => undefined,
	)
	const hasManualResizeRef = useRef(false)
	// 尺寸提到父级，避免 PluginWindow 因 key remount 时重置回默认值。
	const [panelSize, setPanelSize] = useState<PluginWindowSize>(() => {
		const cachedSize = getCachedPluginPanelSize()
		hasManualResizeRef.current = Boolean(cachedSize)
		return cachedSize ?? getDefaultPluginPanelSize()
	})
	const setFrameHeight = useCallback((height: number) => {
		if (hasManualResizeRef.current) return
		setPanelSize((current) => ({ ...current, height }))
	}, [])
	const handleManualResizeStart = useCallback(() => {
		hasManualResizeRef.current = true
	}, [])
	const handleManualResizeEnd = useCallback((nextSize: PluginWindowSize) => {
		hasManualResizeRef.current = true
		setPanelSize(nextSize)
		saveCachedPluginPanelSize(nextSize)
	}, [])

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
			panelSize={panelSize}
			setPanelSize={setPanelSize}
			setFrameHeight={setFrameHeight}
			onManualResizeStart={handleManualResizeStart}
			onManualResizeEnd={handleManualResizeEnd}
		/>
	)
}
