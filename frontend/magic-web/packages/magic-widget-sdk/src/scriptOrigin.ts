const WIDGET_SCRIPT_NAME_PATTERN = /(?:^|\/)magic-widget(?:\.[\w-]+)?\.js$/

function getOriginFromScriptSrc(src: string | null | undefined, baseUrl: string) {
	if (!src) return null

	try {
		const url = new URL(src, baseUrl)
		if (url.protocol !== "https:" && url.protocol !== "http:") return null
		return url.origin
	} catch {
		return null
	}
}

function getHtmlScriptElement(script: Element | null) {
	if (!script || script.tagName.toLowerCase() !== "script") return null
	return script as HTMLScriptElement
}

export function getWidgetScriptOrigin(doc: Document = document) {
	const baseUrl = doc.baseURI || window.location.href
	const currentScript = getHtmlScriptElement(doc.currentScript)
	const currentScriptOrigin = getOriginFromScriptSrc(currentScript?.src, baseUrl)

	if (currentScriptOrigin) return currentScriptOrigin

	const matchingScript = Array.from(doc.scripts)
		.reverse()
		.find((script) => {
			try {
				const url = new URL(script.src, baseUrl)
				return WIDGET_SCRIPT_NAME_PATTERN.test(url.pathname)
			} catch {
				return false
			}
		})

	return getOriginFromScriptSrc(matchingScript?.src, baseUrl)
}
