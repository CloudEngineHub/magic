import {
	applyElementAttributes,
	applyTemporaryStyleProperty,
	createExecutableScript,
	PURE_SHARE_BODY_MARKER,
	PURE_SHARE_RUNTIME_MARKER,
	restoreElementAttributes,
	restoreTemporaryStyleProperty,
	sourceDefinesRootFontSize,
	waitForBlockingScript,
	waitForStylesheet,
	type AttributeOverride,
	type StylePropertyOverride,
} from "./pureShareDocumentUtils"

interface MountPureShareDocumentOptions {
	content: string
	marker: HTMLElement
	onReady?: () => void
}

interface MountedBodyContent {
	nodes: Node[]
	scriptPlaceholders: HTMLScriptElement[]
}

/**
 * Create the shell typography reset used only during pure-share rendering.
 * Example: app letter-spacing "0.01em" -> document default "normal".
 */
function createTypographyResetStyle() {
	const style = document.createElement("style")
	style.setAttribute(PURE_SHARE_RUNTIME_MARKER, "head")
	style.textContent = `
		body[${PURE_SHARE_BODY_MARKER}="true"] {
			letter-spacing: normal;
			-webkit-font-smoothing: auto;
			-moz-osx-font-smoothing: auto;
		}
	`
	return style
}

/**
 * Clone source styles into the live head and start stylesheet loading.
 * Example: source "<link rel='stylesheet'>" -> live document.head link.
 */
function mountHeadStyles(sourceDocument: Document) {
	const nodes: HTMLElement[] = []
	const readyPromises: Promise<void>[] = []

	for (const sourceNode of Array.from(sourceDocument.head.children)) {
		if (sourceNode.tagName !== "STYLE" && sourceNode.tagName !== "LINK") continue

		const node = sourceNode.cloneNode(true) as HTMLElement
		node.setAttribute(PURE_SHARE_RUNTIME_MARKER, "head")
		readyPromises.push(waitForStylesheet(node))
		document.head.appendChild(node)
		nodes.push(node)
	}

	return { nodes, readyPromises }
}

/**
 * Append source body children directly to the live body without a wrapper.
 * Example: "<body><main /></body>" -> document.body > main.
 */
function mountBodyContent(sourceBody: HTMLBodyElement): MountedBodyContent {
	const container = document.createElement("div")
	container.innerHTML = sourceBody.innerHTML

	const scriptPlaceholders = Array.from(container.querySelectorAll("script"))
	const nodes: Node[] = []

	while (container.firstChild) {
		const node = container.firstChild
		nodes.push(node)
		document.body.appendChild(node)
	}

	return { nodes, scriptPlaceholders }
}

/**
 * Execute source scripts in document order and track created runtime nodes.
 * Example: parsed inert script nodes -> executable head scripts, then body scripts.
 */
async function runSourceScripts({
	sourceDocument,
	scriptPlaceholders,
	createdHeadNodes,
	createdBodyScripts,
	isCancelled,
}: {
	sourceDocument: Document
	scriptPlaceholders: HTMLScriptElement[]
	createdHeadNodes: HTMLElement[]
	createdBodyScripts: HTMLScriptElement[]
	isCancelled: () => boolean
}) {
	for (const sourceScript of Array.from(sourceDocument.head.querySelectorAll("script"))) {
		if (isCancelled()) return

		const script = createExecutableScript(sourceScript)
		if (script.src && !script.hasAttribute("async") && !script.hasAttribute("defer")) {
			script.async = false
		}

		const loaded = waitForBlockingScript(script)
		document.head.appendChild(script)
		createdHeadNodes.push(script)
		await loaded
	}

	const sourceBodyScripts = Array.from(sourceDocument.body.querySelectorAll("script"))
	for (let index = 0; index < scriptPlaceholders.length; index += 1) {
		if (isCancelled()) return

		const sourceScript = sourceBodyScripts[index]
		const placeholder = scriptPlaceholders[index]
		if (!sourceScript || !placeholder.isConnected) continue

		const script = createExecutableScript(sourceScript)
		if (script.src && !script.hasAttribute("async") && !script.hasAttribute("defer")) {
			script.async = false
		}

		const loaded = waitForBlockingScript(script)
		placeholder.replaceWith(script)
		createdBodyScripts.push(script)
		await loaded
	}
}

/**
 * Move source CSS behind runtime-injected CSS to preserve the author's cascade.
 * Example: Tailwind runtime style + source body rule -> source body rule wins last.
 */
function moveSourceStylesToHeadEnd(nodes: HTMLElement[]) {
	for (const node of nodes) {
		if (node.tagName === "STYLE" || node.tagName === "LINK") {
			document.head.appendChild(node)
		}
	}
}

/**
 * Mount pure-share HTML into the real document and return its cleanup function.
 * Example: source document body -> native page scroll; cleanup -> original shell restored.
 */
export function mountPureShareDocument({
	content,
	marker,
	onReady,
}: MountPureShareDocumentOptions) {
	const sourceDocument = new DOMParser().parseFromString(content || "", "text/html")
	const sourceBody = sourceDocument.body
	const sourceHtml = sourceDocument.documentElement
	const applicationRoot = marker.closest<HTMLElement>("#root")
	const createdHeadNodes: HTMLElement[] = []
	const createdBodyScripts: HTMLScriptElement[] = []
	const previousTitle = document.title
	let cancelled = false
	let readyFrameId = 0

	const htmlAttributeOverrides = applyElementAttributes(sourceHtml, document.documentElement)
	const bodyAttributeOverrides = applyElementAttributes(sourceBody, document.body)
	const rootFontSizeOverrides: Array<[HTMLElement, string, StylePropertyOverride]> = []

	if (!sourceDefinesRootFontSize(sourceDocument)) {
		rootFontSizeOverrides.push([
			document.documentElement,
			"font-size",
			applyTemporaryStyleProperty(document.documentElement, "font-size", "16px", "important"),
		])
		rootFontSizeOverrides.push([
			document.body,
			"font-size",
			applyTemporaryStyleProperty(document.body, "font-size", "16px", "important"),
		])
	}

	const bodyMarkerPrevious = document.body.getAttribute(PURE_SHARE_BODY_MARKER)
	document.body.setAttribute(PURE_SHARE_BODY_MARKER, "true")

	const applicationRootOverrides = new Map<string, AttributeOverride>()
	if (applicationRoot) {
		const sourceAttributes = document.createElement("div")
		sourceAttributes.id = "magic-pure-share-application-root"
		sourceAttributes.setAttribute("style", "display: none !important")

		for (const [name, override] of applyElementAttributes(sourceAttributes, applicationRoot)) {
			applicationRootOverrides.set(name, override)
		}
	}

	const sourceTitle = sourceDocument.querySelector("title")?.textContent
	if (sourceTitle) document.title = sourceTitle

	const typographyReset = createTypographyResetStyle()
	document.head.appendChild(typographyReset)
	createdHeadNodes.push(typographyReset)

	const mountedHead = mountHeadStyles(sourceDocument)
	createdHeadNodes.push(...mountedHead.nodes)

	const mountedBody = mountBodyContent(sourceBody)

	const finishMount = async () => {
		await runSourceScripts({
			sourceDocument,
			scriptPlaceholders: mountedBody.scriptPlaceholders,
			createdHeadNodes,
			createdBodyScripts,
			isCancelled: () => cancelled,
		})
		if (cancelled) return

		moveSourceStylesToHeadEnd(createdHeadNodes)
		await Promise.all(mountedHead.readyPromises)
		if (document.fonts) await document.fonts.ready
		if (cancelled) return

		readyFrameId = window.requestAnimationFrame(() => {
			if (!cancelled) onReady?.()
		})
	}
	void finishMount()

	return () => {
		cancelled = true
		if (readyFrameId) window.cancelAnimationFrame(readyFrameId)

		mountedBody.nodes.forEach((node) => node.parentNode?.removeChild(node))
		createdBodyScripts.forEach((script) => script.remove())
		createdHeadNodes.forEach((node) => node.remove())
		document.title = previousTitle

		for (const [target, property, override] of rootFontSizeOverrides) {
			restoreTemporaryStyleProperty(target, property, override)
		}
		restoreElementAttributes(document.documentElement, htmlAttributeOverrides)
		restoreElementAttributes(document.body, bodyAttributeOverrides)

		if (document.body.getAttribute(PURE_SHARE_BODY_MARKER) === "true") {
			if (bodyMarkerPrevious === null) {
				document.body.removeAttribute(PURE_SHARE_BODY_MARKER)
			} else {
				document.body.setAttribute(PURE_SHARE_BODY_MARKER, bodyMarkerPrevious)
			}
		}

		if (applicationRoot) {
			restoreElementAttributes(applicationRoot, applicationRootOverrides)
		}
	}
}
