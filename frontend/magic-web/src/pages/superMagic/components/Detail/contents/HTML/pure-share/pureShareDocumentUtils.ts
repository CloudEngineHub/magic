export const PURE_SHARE_RUNTIME_MARKER = "data-magic-pure-share-runtime"
export const PURE_SHARE_BODY_MARKER = "data-magic-pure-share-body"

export interface AttributeOverride {
	previous: string | null
	applied: string
}

export interface StylePropertyOverride {
	previousValue: string
	previousPriority: string
	appliedValue: string
	appliedPriority: string
}

/** Merge class lists without duplicates. Example: "app" + "page app" -> "app page". */
function mergeClassNames(previous: string | null, incoming: string) {
	return Array.from(new Set(`${previous || ""} ${incoming}`.split(/\s+/).filter(Boolean))).join(
		" ",
	)
}

/** Join inline styles while preserving both declarations. Example: "color:red" + "margin:0". */
function mergeInlineStyles(previous: string | null, incoming: string) {
	return [previous?.trim(), incoming.trim()].filter(Boolean).join(";")
}

/**
 * Copy source attributes to a live element and record reversible changes.
 * Example: target class "app" + source class "preview" -> "app preview".
 */
export function applyElementAttributes(source: Element, target: Element) {
	const overrides = new Map<string, AttributeOverride>()

	for (const attribute of Array.from(source.attributes)) {
		const previous = target.getAttribute(attribute.name)
		const applied =
			attribute.name === "class"
				? mergeClassNames(previous, attribute.value)
				: attribute.name === "style"
					? mergeInlineStyles(previous, attribute.value)
					: attribute.value

		overrides.set(attribute.name, { previous, applied })
		target.setAttribute(attribute.name, applied)
	}

	return overrides
}

/**
 * Restore attributes only when their current values still belong to this renderer.
 * Example: "app preview" -> "app"; a concurrently changed value is left untouched.
 */
export function restoreElementAttributes(
	target: Element,
	overrides: Map<string, AttributeOverride>,
) {
	for (const [name, override] of overrides) {
		if (target.getAttribute(name) !== override.applied) continue
		if (override.previous === null) target.removeAttribute(name)
		else target.setAttribute(name, override.previous)
	}
}

/**
 * Detect whether the source owns its root font-size.
 * Example: "html { font-size: 18px }" -> true; no root rule -> false.
 */
export function sourceDefinesRootFontSize(sourceDocument: Document) {
	if (sourceDocument.documentElement.style.fontSize || sourceDocument.body.style.fontSize) {
		return true
	}

	return Array.from(sourceDocument.querySelectorAll("style")).some((style) =>
		/(?:^|[,{])\s*(?:html|body|:root)\s*\{[^}]*font-size\s*:/is.test(style.textContent || ""),
	)
}

/**
 * Apply one temporary inline property and capture its previous declaration.
 * Example: font-size "14px" -> "16px !important".
 */
export function applyTemporaryStyleProperty(
	target: HTMLElement,
	property: string,
	value: string,
	priority: string,
): StylePropertyOverride {
	const previousValue = target.style.getPropertyValue(property)
	const previousPriority = target.style.getPropertyPriority(property)

	target.style.setProperty(property, value, priority)

	return {
		previousValue,
		previousPriority,
		appliedValue: value,
		appliedPriority: priority,
	}
}

/**
 * Restore a temporary property only if nobody replaced it after application.
 * Example: "16px !important" -> previous "14px"; a new "18px" remains unchanged.
 */
export function restoreTemporaryStyleProperty(
	target: HTMLElement,
	property: string,
	override: StylePropertyOverride,
) {
	if (
		target.style.getPropertyValue(property) !== override.appliedValue ||
		target.style.getPropertyPriority(property) !== override.appliedPriority
	) {
		return
	}

	if (override.previousValue) {
		target.style.setProperty(property, override.previousValue, override.previousPriority)
	} else {
		target.style.removeProperty(property)
	}
}

/**
 * Recreate a parsed script so the browser executes it after insertion.
 * Example: inert "<script src='app.js'>" -> live script with the same src.
 */
export function createExecutableScript(source: HTMLScriptElement) {
	const script = document.createElement("script")
	script.setAttribute(PURE_SHARE_RUNTIME_MARKER, "script")

	for (const attribute of Array.from(source.attributes)) {
		if (attribute.name === PURE_SHARE_RUNTIME_MARKER) continue
		script.setAttribute(attribute.name, attribute.value)
	}

	if (!source.hasAttribute("src")) script.textContent = source.textContent || ""
	return script
}

/**
 * Wait for a blocking external script; inline, async, and module scripts continue immediately.
 * Example: classic "app.js" waits for load/error before the next script runs.
 */
export function waitForBlockingScript(script: HTMLScriptElement) {
	if (!script.src || script.async || script.type === "module") return Promise.resolve()

	return new Promise<void>((resolve) => {
		script.addEventListener("load", () => resolve(), { once: true })
		script.addEventListener("error", () => resolve(), { once: true })
	})
}

/**
 * Wait for an external stylesheet to load without blocking style elements.
 * Example: "<link rel='stylesheet'>" waits; "<style>" resolves immediately.
 */
export function waitForStylesheet(node: HTMLElement) {
	if (node.tagName !== "LINK" || (node as HTMLLinkElement).rel !== "stylesheet") {
		return Promise.resolve()
	}

	const link = node as HTMLLinkElement
	if (link.sheet) return Promise.resolve()

	return new Promise<void>((resolve) => {
		link.addEventListener("load", () => resolve(), { once: true })
		link.addEventListener("error", () => resolve(), { once: true })
	})
}
