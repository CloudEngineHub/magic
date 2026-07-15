/** 判断窗口坐标是否落在指定 DOMRect 内 */
export function isPointInRect(clientX: number, clientY: number, rect: DOMRect): boolean {
	return (
		clientX >= rect.left &&
		clientX <= rect.right &&
		clientY >= rect.top &&
		clientY <= rect.bottom
	)
}

/**
 * 将窗口坐标转换为 iframe 内部坐标。
 *
 * 返回 null 表示当前指针不在 iframe 范围内，插件侧应退出 hover/drop 状态。
 */
export function getIframePoint(
	iframe: HTMLIFrameElement | null,
	clientX: number,
	clientY: number,
): { x: number; y: number } | null {
	if (!iframe) return null
	const rect = iframe.getBoundingClientRect()
	if (!isPointInRect(clientX, clientY, rect)) return null
	// 窗口坐标需要换成 iframe 局部坐标，插件侧才知道指针落点。
	return {
		x: clientX - rect.left,
		y: clientY - rect.top,
	}
}

/** 判断当前指针窗口坐标是否悬停在插件浮窗范围内 */
export function getPluginWindowHoverState(
	pluginWindow: HTMLDivElement | null,
	clientX: number,
	clientY: number,
): boolean {
	if (!pluginWindow) return false
	return isPointInRect(clientX, clientY, pluginWindow.getBoundingClientRect())
}
