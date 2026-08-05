const ABSOLUTE_CSS_URL_PATTERN = /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i
const CSS_URL_PATTERN = /url\(\s*(?:(['"])([\s\S]*?)\1|([^)]*))\s*\)/gi
const STYLESHEET_MARKER_ATTRIBUTE = "data-wechat-external-stylesheet"
const STYLESHEET_REQUEST_TIMEOUT_MS = 8_000

export interface PreparedWechatStylesheet {
	cssText: string
	media: string | null
	markerIndex: number
}

function rewriteCssResourceUrls(cssText: string, stylesheetUrl: string): string {
	return cssText.replace(
		CSS_URL_PATTERN,
		(match, quote: string, quotedUrl: string, unquotedUrl: string) => {
			const resourceUrl = (quote ? quotedUrl : unquotedUrl).trim()
			if (!resourceUrl || ABSOLUTE_CSS_URL_PATTERN.test(resourceUrl)) return match

			try {
				const resolvedUrl = new URL(resourceUrl, stylesheetUrl).href
					.replace(/\(/g, "%28")
					.replace(/\)/g, "%29")
				const nextQuote = quote || '"'
				return `url(${nextQuote}${resolvedUrl}${nextQuote})`
			} catch {
				return match
			}
		},
	)
}

export async function prepareWechatExternalStylesheets(
	sourceDocument: Document,
): Promise<PreparedWechatStylesheet[]> {
	const stylesheets = Array.from(
		sourceDocument.querySelectorAll<HTMLLinkElement>("link[rel~='stylesheet'][href]"),
	)
	if (!stylesheets.length) return []

	const preparedStylesheets = await Promise.all(
		stylesheets.map(async (stylesheet, markerIndex) => {
			const controller = new AbortController()
			const timeoutId = setTimeout(() => controller.abort(), STYLESHEET_REQUEST_TIMEOUT_MS)
			try {
				const href = stylesheet.href
				const response = await fetch(href, {
					credentials: "omit",
					signal: controller.signal,
				})
				if (!response.ok) throw new Error("stylesheetLoadFailed")
				return {
					cssText: rewriteCssResourceUrls(await response.text(), href),
					media: stylesheet.getAttribute("media"),
					markerIndex,
				}
			} catch {
				// Returning partially styled HTML would produce a false success state.
				throw new Error("stylesheetLoadFailed")
			} finally {
				clearTimeout(timeoutId)
			}
		}),
	)

	stylesheets.forEach((stylesheet, markerIndex) => {
		const marker = sourceDocument.createElement("meta")
		marker.setAttribute(STYLESHEET_MARKER_ATTRIBUTE, String(markerIndex))
		stylesheet.replaceWith(marker)
	})

	return preparedStylesheets
}

export function injectWechatExternalStylesheets(
	sourceDocument: Document,
	stylesheets: PreparedWechatStylesheet[],
): void {
	stylesheets.forEach(({ cssText, media, markerIndex }) => {
		const marker = sourceDocument.querySelector(
			`[${STYLESHEET_MARKER_ATTRIBUTE}="${markerIndex}"]`,
		)
		if (!marker) return

		// CSS is inserted only after iframe parsing so `</style>` in an external
		// response remains text and cannot escape into executable HTML nodes.
		const styleElement = sourceDocument.createElement("style")
		if (media) styleElement.setAttribute("media", media)
		styleElement.textContent = cssText
		marker.replaceWith(styleElement)
	})
}
