/** 打开系统文件选择框前记录当前全屏元素，供选完/取消后恢复。 */
export function captureFullscreenRestoreTarget(): Element | null {
	return document.fullscreenElement
}

/** 若此前处于全屏且当前已退出，则恢复到记录的全屏元素。 */
export async function restoreFullscreenIfNeeded(target: Element | null): Promise<void> {
	if (!target || document.fullscreenElement) return

	try {
		await target.requestFullscreen()
	} catch (error) {
		console.warn("[fullscreen-restore]", error)
		// 浏览器可能拒绝非用户手势触发的恢复，静默忽略。
	}
}
