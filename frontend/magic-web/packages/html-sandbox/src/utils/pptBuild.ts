/** Authored metadata only. Presentation visibility must never be written into slide HTML. */
export const PPT_BUILD_ATTRIBUTE = "data-magic-ppt-build"
export interface PPTBuild {
	version: 1
	step: number
	effect: "appear" | "fade"
}

export function parsePPTBuild(raw: string | null | undefined): PPTBuild | null {
	if (!raw) return null
	try {
		const value = JSON.parse(raw)
		if (
			!value ||
			value.version !== 1 ||
			!Number.isInteger(value.step) ||
			value.step < 1 ||
			value.step > 1000 ||
			(value.effect !== "appear" && value.effect !== "fade") ||
			Object.keys(value).some((key) => !["version", "step", "effect"].includes(key))
		)
			return null
		return { version: 1, step: value.step, effect: value.effect }
	} catch {
		return null
	}
}

export function isPPTBuildElement(element: Element): boolean {
	// Source markers are present in the editor before authored scripts execute.
	const root = element.ownerDocument.documentElement
	if (root.hasAttribute("data-magic-source-node")) {
		for (let node: Element | null = element; node && node !== root; node = node.parentElement) {
			if (!node.hasAttribute("data-magic-source-node")) return false
		}
	}
	return (
		element.namespaceURI === "http://www.w3.org/1999/xhtml" &&
		!["HTML", "HEAD", "BODY", "SCRIPT", "STYLE", "LINK", "META", "TITLE", "TEMPLATE"].includes(
			element.tagName,
		) &&
		!element.closest("[data-injected], [data-runtime]")
	)
}

/** Keep only outermost valid builds; malformed metadata never hides authored content. */
export function collectPPTBuilds(
	root: Document,
	parse = parsePPTBuild,
	allowed = isPPTBuildElement,
	attribute = PPT_BUILD_ATTRIBUTE,
): Array<{ element: HTMLElement; build: PPTBuild }> {
	const builds: Array<{ element: HTMLElement; build: PPTBuild }> = []
	root.querySelectorAll(`[${attribute}]`).forEach((element) => {
		const build = parse(element.getAttribute(attribute))
		if (!build || !allowed(element) || builds.some((entry) => entry.element.contains(element)))
			return
		builds.push({ element: element as HTMLElement, build })
	})
	return builds
}
