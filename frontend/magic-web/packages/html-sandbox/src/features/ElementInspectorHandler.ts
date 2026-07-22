/**
 * ElementInspectorHandler
 *
 * Lightweight, self-contained inspector that runs inside the iframe.
 * Activated / deactivated by postMessage from the parent window.
 *
 * When active it:
 * 1. Listens for mousemove and reports the hovered element's info.
 * 2. On click, reports the selected element and auto-deactivates.
 * 3. Draws NO overlay itself — the parent-side overlay handles rendering.
 */

import { getElementSelector, isInjectedElement } from "../utils/dom"
import { getParentOrigin } from "../utils/parentOrigin"

// Mirror the constants from the shared types (iframe-runtime is a separate build)
const INSPECTOR_MSG = {
	START: "MAGIC_INSPECTOR_START",
	STOP: "MAGIC_INSPECTOR_STOP",
	HOVER: "MAGIC_INSPECTOR_HOVER",
	SELECT: "MAGIC_INSPECTOR_SELECT",
	HOVER_END: "MAGIC_INSPECTOR_HOVER_END",
} as const

interface BoxModelSides {
	top: number
	right: number
	bottom: number
	left: number
}

interface InspectedElementInfo {
	selector: string
	tagName: string
	id: string
	classList: string[]
	rect: { top: number; left: number; width: number; height: number }
	margin: BoxModelSides
	padding: BoxModelSides
	border: BoxModelSides
	computedStyles: Record<string, string>
	attributes: Record<string, string>
	textContent: string
	accessibleName?: string
	resource?: string
	domContext?: {
		parentSelector: string
		siblingIndex: number
		sameTagSiblingCount: number
		sameTagIndex: number
		previousSibling?: string
		nextSibling?: string
	}
	elementHtml?: string
	selectorMatchCount?: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parsePx(value: string): number {
	const n = parseFloat(value)
	return Number.isFinite(n) ? n : 0
}

function getBoxSides(computed: CSSStyleDeclaration, prefix: string): BoxModelSides {
	return {
		top: parsePx(computed.getPropertyValue(`${prefix}-top`)),
		right: parsePx(computed.getPropertyValue(`${prefix}-right`)),
		bottom: parsePx(computed.getPropertyValue(`${prefix}-bottom`)),
		left: parsePx(computed.getPropertyValue(`${prefix}-left`)),
	}
}

const STYLE_PROPS = [
	"display",
	"position",
	"width",
	"height",
	"color",
	"backgroundColor",
	"fontSize",
	"fontFamily",
	"fontWeight",
	"lineHeight",
	"textAlign",
	"opacity",
	"borderRadius",
	"overflow",
	"zIndex",
	"flexDirection",
	"justifyContent",
	"alignItems",
] as const

const MAX_TEXT_LENGTH = 120
const MAX_ATTRS = 10
const MAX_RESOURCE_LENGTH = 240
const MAX_HTML_LENGTH = 800
const RESOURCE_ATTRIBUTES = new Set([
	"src",
	"href",
	"poster",
	"srcset",
	"data-src",
	"data-href",
	"data-url",
	"data-original",
])
const SENSITIVE_ATTRIBUTE_PATTERN = /(authorization|credential|api[-_]?key|token|secret|signature)/i
const VOID_TAGS = new Set([
	"area",
	"base",
	"br",
	"col",
	"embed",
	"hr",
	"img",
	"input",
	"link",
	"meta",
	"param",
	"source",
	"track",
	"wbr",
])

function normalizeResource(value: string | null | undefined): string {
	if (!value) return ""
	const raw = value.trim()
	if (raw.startsWith("data:")) return raw.slice(0, MAX_RESOURCE_LENGTH)
	const withoutQuery = raw.split(/[?#]/, 1)[0]
	if (!/^[a-z][a-z\d+.-]*:/i.test(withoutQuery) && !withoutQuery.startsWith("//")) {
		return withoutQuery.slice(0, MAX_RESOURCE_LENGTH)
	}
	try {
		const url = new URL(raw, window.location.href)
		url.search = ""
		url.hash = ""
		return url.href.slice(0, MAX_RESOURCE_LENGTH)
	} catch {
		return withoutQuery.slice(0, MAX_RESOURCE_LENGTH)
	}
}

function getElementResource(element: HTMLElement): string {
	if (element instanceof HTMLImageElement) {
		return normalizeResource(element.getAttribute("src") || element.currentSrc || element.src)
	}
	if (element instanceof HTMLSourceElement) return normalizeResource(element.src)
	if (element instanceof HTMLMediaElement)
		return normalizeResource(element.currentSrc || element.src)
	return normalizeResource(
		element.getAttribute("src") ||
			element.getAttribute("href") ||
			element.getAttribute("poster"),
	)
}

function normalizeAttributeValue(name: string, value: string): string {
	if (name === "srcset") {
		return value
			.split(",")
			.map((item) => {
				const [resource, ...descriptor] = item.trim().split(/\s+/)
				return [normalizeResource(resource), ...descriptor].join(" ")
			})
			.join(", ")
	}
	return RESOURCE_ATTRIBUTES.has(name) ? normalizeResource(value) : value
}

function isSensitiveAttribute(name: string): boolean {
	return SENSITIVE_ATTRIBUTE_PATTERN.test(name)
}

function getElementLabel(element: Element): string {
	const tag = element.tagName.toLowerCase()
	const id = element.id ? `#${element.id}` : ""
	const className =
		typeof (element as HTMLElement).className === "string"
			? (element as HTMLElement).className
					.trim()
					.split(/\s+/)
					.filter(Boolean)
					.slice(0, 2)
					.map((name) => `.${name}`)
					.join("")
			: ""
	const resource = getElementResource(element as HTMLElement)
	const text = (element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 48)
	return `${tag}${id}${className}${resource ? ` resource=${resource}` : ""}${text ? ` text=${text}` : ""}`
}

function sanitizeOuterHTML(element: HTMLElement): string {
	const clone = element.cloneNode(false) as HTMLElement
	clone.removeAttribute("style")
	for (const attribute of Array.from(clone.attributes)) {
		if (isSensitiveAttribute(attribute.name)) {
			clone.removeAttribute(attribute.name)
			continue
		}
		if (!RESOURCE_ATTRIBUTES.has(attribute.name)) continue
		clone.setAttribute(attribute.name, normalizeAttributeValue(attribute.name, attribute.value))
	}
	if (!VOID_TAGS.has(element.tagName.toLowerCase())) {
		clone.textContent = (element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120)
	}
	return clone.outerHTML.slice(0, MAX_HTML_LENGTH)
}

function getDomContext(element: HTMLElement) {
	const parent = element.parentElement
	if (!parent) {
		return { parentSelector: "", siblingIndex: 1, sameTagSiblingCount: 1, sameTagIndex: 1 }
	}
	const children = Array.from(parent.children)
	const sameTagSiblings = children.filter(
		(child) => child.tagName.toLowerCase() === element.tagName.toLowerCase(),
	)
	const siblingIndex = children.indexOf(element) + 1
	return {
		parentSelector: getElementSelector(parent),
		siblingIndex,
		sameTagSiblingCount: sameTagSiblings.length,
		sameTagIndex: sameTagSiblings.indexOf(element) + 1,
		previousSibling: element.previousElementSibling
			? getElementLabel(element.previousElementSibling)
			: undefined,
		nextSibling: element.nextElementSibling
			? getElementLabel(element.nextElementSibling)
			: undefined,
	}
}

function collectElementInfo(element: HTMLElement): InspectedElementInfo {
	const computed = window.getComputedStyle(element)
	const rect = element.getBoundingClientRect()

	const computedStyles: Record<string, string> = {}
	for (const prop of STYLE_PROPS) {
		computedStyles[prop] = computed[prop as keyof CSSStyleDeclaration] as string
	}

	// Collect important attributes (skip class/id/style — already exposed separately)
	const attributes: Record<string, string> = {}
	const skipAttrs = new Set(["class", "id", "style"])
	let attrCount = 0
	for (let i = 0; i < element.attributes.length && attrCount < MAX_ATTRS; i++) {
		const attr = element.attributes[i]
		if (!skipAttrs.has(attr.name) && !isSensitiveAttribute(attr.name)) {
			const value = normalizeAttributeValue(attr.name, attr.value)
			attributes[attr.name] = value.length > 160 ? `${value.slice(0, 160)}…` : value
			attrCount++
		}
	}

	const rawText = element.textContent?.trim() ?? ""
	const textContent =
		rawText.length > MAX_TEXT_LENGTH ? `${rawText.slice(0, MAX_TEXT_LENGTH)}…` : rawText

	const classList: string[] = []
	if (element.className && typeof element.className === "string") {
		element.className
			.trim()
			.split(/\s+/)
			.filter(Boolean)
			.forEach((c) => classList.push(c))
	}

	const selector = getElementSelector(element)
	return {
		selector,
		tagName: element.tagName.toLowerCase(),
		id: element.id || "",
		classList,
		rect: {
			top: rect.top,
			left: rect.left,
			width: rect.width,
			height: rect.height,
		},
		margin: getBoxSides(computed, "margin"),
		padding: getBoxSides(computed, "padding"),
		border: {
			top: parsePx(computed.borderTopWidth),
			right: parsePx(computed.borderRightWidth),
			bottom: parsePx(computed.borderBottomWidth),
			left: parsePx(computed.borderLeftWidth),
		},
		computedStyles,
		attributes,
		textContent,
		resource: getElementResource(element),
		domContext: getDomContext(element),
		elementHtml: sanitizeOuterHTML(element),
		selectorMatchCount: (() => {
			try {
				return document.querySelectorAll(selector).length
			} catch {
				return 0
			}
		})(),
		accessibleName:
			element.getAttribute("aria-label") ||
			element.getAttribute("alt") ||
			element.getAttribute("title") ||
			undefined,
	}
}

// ─── Handler class ───────────────────────────────────────────────────────────

export class ElementInspectorHandler {
	private active = false
	private hoveredElement: HTMLElement | null = null

	private onMouseMove = (e: MouseEvent) => {
		if (!this.active) return

		const target = e.target as HTMLElement
		if (!target || target === document.body || target === document.documentElement) {
			return
		}
		if (isInjectedElement(target)) return

		if (this.hoveredElement === target) return
		this.hoveredElement = target

		const info = collectElementInfo(target)
		try {
			window.parent.postMessage(
				{ type: INSPECTOR_MSG.HOVER, elementInfo: info, timestamp: Date.now() },
				getParentOrigin(),
			)
		} catch {
			// ignore
		}
	}

	private onMouseOut = (e: MouseEvent) => {
		if (!this.active) return

		// Only send hover-end if the mouse actually left all content
		const related = e.relatedTarget as HTMLElement | null
		if (!related || related === document.documentElement) {
			this.hoveredElement = null
			try {
				window.parent.postMessage(
					{ type: INSPECTOR_MSG.HOVER_END, timestamp: Date.now() },
					getParentOrigin(),
				)
			} catch {
				// ignore
			}
		}
	}

	private onClick = (e: MouseEvent) => {
		if (!this.active) return

		const target = e.target as HTMLElement
		if (!target || isInjectedElement(target)) return

		e.preventDefault()
		e.stopPropagation()
		e.stopImmediatePropagation()

		const info = collectElementInfo(target)
		try {
			window.parent.postMessage(
				{ type: INSPECTOR_MSG.SELECT, elementInfo: info, timestamp: Date.now() },
				getParentOrigin(),
			)
		} catch {
			// ignore
		}

		// Auto-deactivate after selection
		this.deactivate()
	}

	activate(): void {
		if (this.active) return
		this.active = true
		this.hoveredElement = null

		// Capture phase so we intercept before any page handlers
		document.addEventListener("mousemove", this.onMouseMove, true)
		document.addEventListener("mouseout", this.onMouseOut, true)
		document.addEventListener("click", this.onClick, true)

		// Set cursor to crosshair on the whole page
		document.documentElement.style.cursor = "crosshair"
	}

	deactivate(): void {
		if (!this.active) return
		this.active = false
		this.hoveredElement = null

		document.removeEventListener("mousemove", this.onMouseMove, true)
		document.removeEventListener("mouseout", this.onMouseOut, true)
		document.removeEventListener("click", this.onClick, true)

		document.documentElement.style.cursor = ""
	}
}
