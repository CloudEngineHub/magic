const WECHAT_COMPUTED_STYLE_PROPERTIES = [
	"box-sizing",
	"display",
	// Do not inline computed width/height constraints. The synchronous fallback
	// renders in a hidden iframe where images may not be loaded yet, so computed
	// geometry can temporarily be 0px or a preview-only pixel width. Author CSS
	// rules and inline styles are preserved separately by inlineStyleRules().
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
	"background-position",
	"background-repeat",
	"background-size",
	"box-shadow",
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
	"text-shadow",
	"text-transform",
	"white-space",
	"word-break",
	"overflow-wrap",
	"vertical-align",
	"list-style",
	"object-fit",
	"object-position",
	"opacity",
	"flex",
	"flex-basis",
	"flex-direction",
	"flex-grow",
	"flex-shrink",
	"flex-wrap",
	"align-items",
	"align-content",
	"align-self",
	"justify-content",
	"justify-items",
	"justify-self",
	"gap",
	"column-gap",
	"row-gap",
	"grid-auto-columns",
	"grid-auto-flow",
	"grid-auto-rows",
	"grid-column",
	"grid-row",
	"grid-template-columns",
	"grid-template-rows",
] as const

const WECHAT_ARTICLE_COMMENTS_SELECTOR = "[data-wechat-article-comments='true']"

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
	const sourceElements = [sourceDocument.body, ...sourceDocument.body.querySelectorAll("*")]
	const targetElements = [targetBody, ...targetBody.querySelectorAll("*")]
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
					const matches = [
						...(sourceDocument.body.matches(selector) ? [sourceDocument.body] : []),
						...sourceDocument.body.querySelectorAll(selector),
					]
					matches.forEach((sourceElement) => {
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

	const sourceElements = [sourceDocument.body, ...sourceDocument.body.querySelectorAll("*")]
	const targetElements = [targetBody, ...targetBody.querySelectorAll("*")]
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

function removeEventHandlerAttributes(root: ParentNode): void {
	root.querySelectorAll("*").forEach((element) => {
		Array.from(element.attributes).forEach((attribute) => {
			if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name)
		})
	})
}

function sanitizeSourceBeforeRender(root: ParentNode): void {
	root.querySelectorAll("script,iframe,object,embed,base,meta[http-equiv='refresh']").forEach(
		(node) => node.remove(),
	)
	removeEventHandlerAttributes(root)
}

function removeUnsafeClipboardNodes(root: ParentNode): void {
	root.querySelectorAll(
		`script,style,link[rel='stylesheet'],meta,title,iframe,object,embed,base,${WECHAT_ARTICLE_COMMENTS_SELECTOR}`,
	).forEach((node) => node.remove())
	removeEventHandlerAttributes(root)
}

function serializeTargetBody(targetBody: HTMLElement): string | null {
	// Native “select all → copy” copies the body children, not the body layout
	// container. Carrying body width/padding into WeChat can make the pasted
	// article wider than the editor viewport and hide overflowing content.
	const html = targetBody.innerHTML.trim()
	return html || null
}

function createRenderedSourceDocument(html: string): {
	document: Document
	dispose: () => void
} | null {
	if (typeof document === "undefined" || !document.body) return null

	const iframe = document.createElement("iframe")
	iframe.setAttribute("sandbox", "allow-same-origin")
	iframe.setAttribute("aria-hidden", "true")
	iframe.style.cssText =
		"position:fixed;left:-100000px;top:0;width:760px;height:1000px;visibility:hidden;pointer-events:none"
	document.body.appendChild(iframe)

	const sourceDocument = iframe.contentDocument
	if (!sourceDocument) {
		iframe.remove()
		return null
	}

	try {
		sourceDocument.open()
		sourceDocument.write(html)
		sourceDocument.close()
		return {
			document: sourceDocument,
			dispose: () => iframe.remove(),
		}
	} catch {
		iframe.remove()
		return null
	}
}

export function buildWechatClipboardHtmlFromDocument(sourceDocument: Document): string | null {
	const sourceBody = sourceDocument.body
	if (!sourceBody) return null

	const targetBody = sourceBody.cloneNode(true) as HTMLElement
	inlineStyleRules(sourceDocument, targetBody)
	inlineComputedStyles(sourceDocument, targetBody)
	removeUnsafeClipboardNodes(targetBody)

	return serializeTargetBody(targetBody)
}

export function buildWechatClipboardHtmlFromIframe(
	iframe: HTMLIFrameElement | null | undefined,
): string | null {
	try {
		const sourceDocument = iframe?.contentDocument
		if (!sourceDocument?.body) return null
		return buildWechatClipboardHtmlFromDocument(sourceDocument)
	} catch {
		// A configured external sandbox can make the preview iframe cross-origin.
		return null
	}
}

export function buildWechatClipboardHtmlFromSource(html: string): string {
	if (!html) return html
	if (typeof DOMParser === "undefined") return html

	const parsedDocument = new DOMParser().parseFromString(html, "text/html")
	sanitizeSourceBeforeRender(parsedDocument)
	const renderedSource = createRenderedSourceDocument(parsedDocument.documentElement.outerHTML)
	if (!renderedSource) return buildWechatClipboardHtmlFromDocument(parsedDocument) || html

	try {
		return buildWechatClipboardHtmlFromDocument(renderedSource.document) || html
	} finally {
		renderedSource.dispose()
	}
}
