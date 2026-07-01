import { colorToHex, hasVisibleBackground } from "../shared/color"

/**
 * 提取 body/html 元素的背景色，作为 PPT 幻灯片背景。
 * 优先取 body，若 body 透明则取 html。
 * 返回 hex 色值（不含 #），若无可见背景色则返回 null。
 */
export function extractBodyBackground(doc: Document, win: Window): string | null {
	const body = doc.body
	if (!body) return null

	const bodyStyle = win.getComputedStyle(body)
	if (hasVisibleBackground(bodyStyle.backgroundColor)) {
		return colorToHex(bodyStyle.backgroundColor)
	}

	const html = doc.documentElement
	if (!html) return null

	const htmlStyle = win.getComputedStyle(html)
	if (hasVisibleBackground(htmlStyle.backgroundColor)) {
		return colorToHex(htmlStyle.backgroundColor)
	}

	return null
}
