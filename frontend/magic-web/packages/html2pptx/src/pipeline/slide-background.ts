import { colorToHex, hasVisibleBackground } from "../shared/color"

/**
 * Extract the body/html background color for use as the PPT slide background.
 * Prefer body; if body is transparent, use html.
 * Return a hex color without #, or null if there is no visible background color.
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
