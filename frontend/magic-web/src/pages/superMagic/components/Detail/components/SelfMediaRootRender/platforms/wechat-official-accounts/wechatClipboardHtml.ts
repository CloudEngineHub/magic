const WECHAT_COMPUTED_STYLE_PROPERTIES = [
	"box-sizing",
	"display",
	"width",
	"max-width",
	"min-width",
	"height",
	"max-height",
	"min-height",
	"margin",
	"margin-top",
	"margin-right",
	"margin-bottom",
	"margin-left",
	"padding",
	"padding-top",
	"padding-right",
	"padding-bottom",
	"padding-left",
	"border",
	"border-top",
	"border-right",
	"border-bottom",
	"border-left",
	"border-radius",
	"background",
	"background-color",
	"background-image",
	"color",
	"font",
	"font-family",
	"font-size",
	"font-style",
	"font-weight",
	"letter-spacing",
	"line-height",
	"text-align",
	"text-decoration",
	"text-indent",
	"white-space",
	"word-break",
	"overflow-wrap",
	"vertical-align",
	"list-style",
	"opacity",
	"flex",
	"flex-direction",
	"flex-wrap",
	"align-items",
	"justify-content",
	"gap",
] as const

function parseInlineStyle(styleText: string | null): Map<string, string> {
	const result = new Map<string, string>()
	if (!styleText) return result

	const declaration = document.createElement("span").style
	declaration.cssText = styleText
	for (let i = 0; i < declaration.length; i += 1) {
		const property = declaration.item(i)
		const value = declaration.getPropertyValue(property).trim()
		if (property && value) result.set(property, value)
	}
	return result
}

function serializeStyle(styleMap: Map<string, string>): string {
	return Array.from(styleMap.entries())
		.map(([property, value]) => `${property}:${value}`)
		.join(";")
}

function applyStyleMap(target: Element, nextStyles: Map<string, string>): void {
	if (!nextStyles.size) return
	const styleMap = parseInlineStyle(target.getAttribute("style"))
	nextStyles.forEach((value, property) => {
		if (value) styleMap.set(property, value)
	})
	const serialized = serializeStyle(styleMap)
	if (serialized) target.setAttribute("style", serialized)
}

function parseDeclarationBlock(block: string): Map<string, string> {
	const result = new Map<string, string>()
	const declaration = document.createElement("span").style
	declaration.cssText = block
	for (let i = 0; i < declaration.length; i += 1) {
		const property = declaration.item(i)
		const value = declaration.getPropertyValue(property).trim()
		if (property && value) result.set(property, value)
	}
	return result
}

function inlineStyleRules(sourceDocument: Document, targetBody: HTMLElement): void {
	const sourceElements = Array.from(sourceDocument.body.querySelectorAll("*"))
	const targetElements = Array.from(targetBody.querySelectorAll("*"))
	if (!sourceElements.length || !targetElements.length) return

	const sourceToTarget = new Map<Element, Element>()
	sourceElements.forEach((element, index) => {
		const target = targetElements[index]
		if (target) sourceToTarget.set(element, target)
	})

	sourceDocument.querySelectorAll("style").forEach((styleElement) => {
		const cssText = styleElement.textContent || ""
		const rulePattern = /([^{}]+)\{([^{}]+)\}/g
		let match: RegExpExecArray | null
		while ((match = rulePattern.exec(cssText))) {
			const selectorText = match[1].trim()
			const declarationText = match[2].trim()
			if (!selectorText || selectorText.startsWith("@")) continue

			const declarations = parseDeclarationBlock(declarationText)
			if (!declarations.size) continue

			selectorText.split(",").forEach((rawSelector) => {
				const selector = rawSelector.trim()
				if (!selector || selector.includes(":")) return
				try {
					sourceDocument.body.querySelectorAll(selector).forEach((sourceElement) => {
						const targetElement = sourceToTarget.get(sourceElement)
						if (targetElement) applyStyleMap(targetElement, declarations)
					})
				} catch {
					// Ignore selectors the browser cannot query in a paste-safe fragment.
				}
			})
		}
	})
}

function inlineComputedStyles(sourceDocument: Document, targetBody: HTMLElement): void {
	const sourceWindow = sourceDocument.defaultView
	if (!sourceWindow?.getComputedStyle) return

	const sourceElements = Array.from(sourceDocument.body.querySelectorAll("*"))
	const targetElements = Array.from(targetBody.querySelectorAll("*"))
	sourceElements.forEach((sourceElement, index) => {
		const targetElement = targetElements[index]
		if (!targetElement) return

		const computed = sourceWindow.getComputedStyle(sourceElement)
		const nextStyles = new Map<string, string>()
		WECHAT_COMPUTED_STYLE_PROPERTIES.forEach((property) => {
			const value = computed.getPropertyValue(property).trim()
			if (value) nextStyles.set(property, value)
		})
		applyStyleMap(targetElement, nextStyles)
	})
}

function removeUnsafeClipboardNodes(targetBody: HTMLElement): void {
	targetBody
		.querySelectorAll("script,style,link[rel='stylesheet'],meta,title")
		.forEach((node) => node.remove())
	targetBody.querySelectorAll("*").forEach((element) => {
		Array.from(element.attributes).forEach((attribute) => {
			if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name)
		})
	})
}

export function buildWechatClipboardHtmlFromDocument(sourceDocument: Document): string | null {
	const sourceBody = sourceDocument.body
	if (!sourceBody) return null

	const targetBody = sourceBody.cloneNode(true) as HTMLElement
	inlineStyleRules(sourceDocument, targetBody)
	inlineComputedStyles(sourceDocument, targetBody)
	removeUnsafeClipboardNodes(targetBody)

	const html = targetBody.innerHTML.trim()
	return html || null
}

export function buildWechatClipboardHtmlFromIframe(
	iframe: HTMLIFrameElement | null | undefined,
): string | null {
	const sourceDocument = iframe?.contentDocument
	if (!sourceDocument?.body) return null
	return buildWechatClipboardHtmlFromDocument(sourceDocument)
}

export function buildWechatClipboardHtmlFromSource(html: string): string {
	if (!html) return html
	if (typeof DOMParser === "undefined") return html
	const sourceDocument = new DOMParser().parseFromString(html, "text/html")
	return buildWechatClipboardHtmlFromDocument(sourceDocument) || html
}
