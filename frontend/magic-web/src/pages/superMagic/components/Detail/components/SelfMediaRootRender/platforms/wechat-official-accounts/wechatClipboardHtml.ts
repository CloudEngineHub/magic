import {
	hasTopLevelCssImport,
	injectWechatExternalStylesheets,
	prepareWechatExternalStylesheets,
} from "./wechatClipboardStyles"

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

interface StyleValue {
	priority: string
	value: string
}

type StyleMap = Map<string, StyleValue>
type SelectorSpecificity = [number, number, number]

interface StyleCandidate extends StyleValue {
	order: number
	specificity: SelectorSpecificity
}

interface ActiveStyleRule {
	declarations: StyleMap
	selectorText: string
}

const CSS_STYLE_RULE = 1
const CSS_IMPORT_RULE = 3
const CSS_MEDIA_RULE = 4
const MAX_STYLE_RULES = 3_000
const MAX_STYLE_RULE_DEPTH = 32
const MAX_STYLE_SELECTORS = 6_000
const MAX_STYLE_MATCHES = 50_000

interface StyleRuleBudget {
	ruleCount: number
}

function parseInlineStyle(styleText: string | null): StyleMap {
	const result: StyleMap = new Map()
	if (!styleText) return result

	const declaration = document.createElement("span").style
	declaration.cssText = styleText
	for (let i = 0; i < declaration.length; i += 1) {
		const property = declaration.item(i)
		const value = declaration.getPropertyValue(property).trim()
		if (property && value) {
			result.set(property, {
				priority: declaration.getPropertyPriority(property),
				value,
			})
		}
	}
	return result
}

function serializeStyle(styleMap: StyleMap): string {
	return Array.from(styleMap.entries())
		.map(
			([property, { priority, value }]) =>
				`${property}:${value}${priority ? ` !${priority}` : ""}`,
		)
		.join(";")
}

function applyStyleMap(target: Element, nextStyles: StyleMap): void {
	if (!nextStyles.size) return
	const styleMap = parseInlineStyle(target.getAttribute("style"))
	nextStyles.forEach((styleValue, property) => {
		if (styleValue.value) styleMap.set(property, styleValue)
	})
	const serialized = serializeStyle(styleMap)
	if (serialized) target.setAttribute("style", serialized)
}

function compareSpecificity(left: SelectorSpecificity, right: SelectorSpecificity): number {
	for (let index = 0; index < left.length; index += 1) {
		if (left[index] !== right[index]) return left[index] - right[index]
	}
	return 0
}

function getSelectorSpecificity(selector: string): SelectorSpecificity {
	const withoutAttributes = selector.replace(/\[[^\]]*\]/g, "")
	const idCount = (withoutAttributes.match(/#[\w-]+/g) || []).length
	const classCount =
		(withoutAttributes.match(/\.[\w-]+/g) || []).length +
		(selector.match(/\[[^\]]*\]/g) || []).length
	const typeSelectorText = withoutAttributes.replace(/#[\w-]+|\.[\w-]+/g, "").replace(/\*/g, "")
	const typeCount = (typeSelectorText.match(/(?:^|[\s>+~])(?:[\w-]+\|)?[a-z][\w-]*/gi) || [])
		.length
	return [idCount, classCount, typeCount]
}

function shouldReplaceCandidate(
	current: StyleCandidate | undefined,
	next: StyleCandidate,
): boolean {
	if (!current) return true
	const currentImportant = current.priority === "important"
	const nextImportant = next.priority === "important"
	if (currentImportant !== nextImportant) return nextImportant

	const specificityDifference = compareSpecificity(next.specificity, current.specificity)
	if (specificityDifference !== 0) return specificityDifference > 0
	return next.order >= current.order
}

function isMediaQueryActive(sourceDocument: Document, mediaText: string | null): boolean {
	const query = mediaText?.trim()
	if (!query || query.toLowerCase() === "all") return true

	const sourceWindow = sourceDocument.defaultView
	if (sourceWindow?.matchMedia) return sourceWindow.matchMedia(query).matches

	// DOM-only test environments may not implement matchMedia. Keep ordinary
	// screen and feature queries active, but never apply print-only declarations.
	return query.split(",").some((item) => {
		const normalized = item.trim().toLowerCase()
		if (/^(?:only\s+)?print(?:\s+and|\s*$)/.test(normalized)) return false
		if (/^not\s+(?:only\s+)?screen(?:\s+and|\s*$)/.test(normalized)) return false
		return true
	})
}

function consumeStyleRule(budget: StyleRuleBudget): void {
	budget.ruleCount += 1
	if (budget.ruleCount > MAX_STYLE_RULES) throw new Error("stylesheetRuleLimitExceeded")
}

function parseStyleRulesFromText(cssText: string, budget: StyleRuleBudget): ActiveStyleRule[] {
	if (hasTopLevelCssImport(cssText)) throw new Error("stylesheetImportUnsupported")
	const rules: ActiveStyleRule[] = []
	const rulePattern = /([^{}]+)\{([^{}]+)\}/g
	let match: RegExpExecArray | null
	while ((match = rulePattern.exec(cssText))) {
		consumeStyleRule(budget)
		const selectorText = match[1].trim()
		const declarations = parseInlineStyle(match[2].trim())
		if (selectorText && !selectorText.startsWith("@") && declarations.size) {
			rules.push({ declarations, selectorText })
		}
	}
	return rules
}

function getActiveStyleRules(
	styleElement: HTMLStyleElement,
	sourceDocument: Document,
	budget: StyleRuleBudget,
): ActiveStyleRule[] {
	if (!isMediaQueryActive(sourceDocument, styleElement.getAttribute("media"))) return []

	try {
		const sheetRules = styleElement.sheet?.cssRules
		if (!sheetRules) return parseStyleRulesFromText(styleElement.textContent || "", budget)

		const activeRules: ActiveStyleRule[] = []
		const collectRules = (rules: CSSRuleList, depth = 0): void => {
			if (depth > MAX_STYLE_RULE_DEPTH) throw new Error("stylesheetRuleLimitExceeded")
			for (let index = 0; index < rules.length; index += 1) {
				const rule = rules.item(index)
				if (!rule) continue
				consumeStyleRule(budget)
				if (rule.type === CSS_STYLE_RULE) {
					const styleRule = rule as CSSStyleRule
					const declarations = parseInlineStyle(styleRule.style.cssText)
					if (styleRule.selectorText && declarations.size) {
						activeRules.push({ declarations, selectorText: styleRule.selectorText })
					}
					continue
				}

				if (rule.type === CSS_IMPORT_RULE) {
					// External imports are expanded before injection. Reaching an import
					// here means the pipeline cannot prove that the copied styles are complete.
					throw new Error("stylesheetImportUnsupported")
				}

				if (rule.type === CSS_MEDIA_RULE) {
					const mediaRule = rule as CSSMediaRule
					if (isMediaQueryActive(sourceDocument, mediaRule.media.mediaText)) {
						collectRules(mediaRule.cssRules, depth + 1)
					}
				}
			}
		}
		collectRules(sheetRules)
		return activeRules
	} catch (error) {
		if (error instanceof Error && error.message.startsWith("stylesheet")) throw error
		return parseStyleRulesFromText(styleElement.textContent || "", budget)
	}
}

function inlineStyleRules(sourceDocument: Document, targetBody: HTMLElement): void {
	const sourceElements = [sourceDocument.body, ...sourceDocument.body.querySelectorAll("*")]
	const targetElements = [targetBody, ...targetBody.querySelectorAll("*")]
	if (!sourceElements.length || !targetElements.length) return

	const sourceToTarget = new Map<Element, Element>()
	const candidatesByElement = new Map<Element, Map<string, StyleCandidate>>()
	const ruleBudget: StyleRuleBudget = { ruleCount: 0 }
	let matchCount = 0
	let selectorCount = 0
	sourceElements.forEach((element, index) => {
		const target = targetElements[index]
		if (target) sourceToTarget.set(element, target)
	})

	let ruleOrder = 0
	sourceDocument.querySelectorAll<HTMLStyleElement>("style").forEach((styleElement) => {
		const activeStyleRules = getActiveStyleRules(styleElement, sourceDocument, ruleBudget)

		activeStyleRules.forEach(({ declarations, selectorText }) => {
			ruleOrder += 1

			selectorText.split(",").forEach((rawSelector) => {
				const selector = rawSelector.trim()
				selectorCount += 1
				if (selectorCount > MAX_STYLE_SELECTORS) {
					throw new Error("stylesheetRuleLimitExceeded")
				}
				if (!selector || selector.includes(":")) return
				const specificity = getSelectorSpecificity(selector)
				try {
					const bodyMatches = sourceDocument.body.matches(selector)
					const matchedElements = sourceDocument.body.querySelectorAll(selector)
					matchCount += matchedElements.length + (bodyMatches ? 1 : 0)
					if (matchCount > MAX_STYLE_MATCHES) {
						throw new Error("stylesheetRuleLimitExceeded")
					}
					const applyDeclarations = (sourceElement: Element) => {
						let elementCandidates = candidatesByElement.get(sourceElement)
						if (!elementCandidates) {
							elementCandidates = new Map()
							candidatesByElement.set(sourceElement, elementCandidates)
						}
						declarations.forEach(({ priority, value }, property) => {
							const candidate = { order: ruleOrder, priority, specificity, value }
							if (
								shouldReplaceCandidate(elementCandidates.get(property), candidate)
							) {
								elementCandidates.set(property, candidate)
							}
						})
					}
					if (bodyMatches) applyDeclarations(sourceDocument.body)
					matchedElements.forEach(applyDeclarations)
				} catch (error) {
					if (error instanceof Error && error.message.startsWith("stylesheet")) {
						throw error
					}
					// Ignore selectors the browser cannot query in a paste-safe fragment.
				}
			})
		})
	})

	candidatesByElement.forEach((candidates, sourceElement) => {
		const targetElement = sourceToTarget.get(sourceElement)
		if (!targetElement) return
		const inlineStyles = parseInlineStyle(sourceElement.getAttribute("style"))
		const winningStyles: StyleMap = new Map()
		candidates.forEach((candidate, property) => {
			const inlineStyle = inlineStyles.get(property)
			if (
				inlineStyle &&
				(inlineStyle.priority === "important" || candidate.priority !== "important")
			) {
				return
			}
			winningStyles.set(property, candidate)
		})
		applyStyleMap(targetElement, winningStyles)
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
		const nextStyles: StyleMap = new Map()
		WECHAT_COMPUTED_STYLE_PROPERTIES.forEach((property) => {
			const value = computed.getPropertyValue(property).trim()
			if (value) nextStyles.set(property, { priority: "", value })
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

function assertNoUnpreparedStyleImports(root: ParentNode): void {
	root.querySelectorAll<HTMLStyleElement>("style").forEach((styleElement) => {
		if (hasTopLevelCssImport(styleElement.textContent || "")) {
			// Inline imports have no trustworthy base URL after source parsing. Reject
			// them before iframe creation so the browser cannot start an unbounded fetch.
			throw new Error("stylesheetImportUnsupported")
		}
	})
}

function removeUnsafeClipboardNodes(root: ParentNode): void {
	root.querySelectorAll(
		`script,style,link,meta,title,iframe,object,embed,base,${WECHAT_ARTICLE_COMMENTS_SELECTOR}`,
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
		if (sourceDocument.querySelector("link[rel~='stylesheet'][href]")) {
			// Computed styles cannot safely preserve every author rule (notably
			// responsive width/height). Let the source path fetch and expand links.
			return null
		}
		return buildWechatClipboardHtmlFromDocument(sourceDocument)
	} catch {
		// A configured external sandbox can make the preview iframe cross-origin.
		return null
	}
}

export async function buildWechatClipboardHtmlFromSource(html: string): Promise<string> {
	if (!html) return html
	if (typeof DOMParser === "undefined") return html

	const parsedDocument = new DOMParser().parseFromString(html, "text/html")
	sanitizeSourceBeforeRender(parsedDocument)
	assertNoUnpreparedStyleImports(parsedDocument)
	const externalStylesheets = await prepareWechatExternalStylesheets(parsedDocument)
	const renderedSource = createRenderedSourceDocument(parsedDocument.documentElement.outerHTML)
	if (!renderedSource) {
		injectWechatExternalStylesheets(parsedDocument, externalStylesheets)
		return buildWechatClipboardHtmlFromDocument(parsedDocument) || html
	}

	try {
		injectWechatExternalStylesheets(renderedSource.document, externalStylesheets)
		return buildWechatClipboardHtmlFromDocument(renderedSource.document) || html
	} finally {
		renderedSource.dispose()
	}
}
