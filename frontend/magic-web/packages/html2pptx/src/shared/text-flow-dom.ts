import { hasRenderableText } from "./text-utils"

/** Direct text plus text nested only through display:contents wrappers. */
export function collectTextNodesThroughDisplayContents(root: Element): Text[] {
	const win = root.ownerDocument.defaultView
	if (!win) return []
	const rootStyle = win.getComputedStyle(root)
	if (
		rootStyle.display === "none" ||
		rootStyle.getPropertyValue("content-visibility") === "hidden"
	) {
		return []
	}
	const output: Text[] = []

	const visit = (element: Element): void => {
		for (const child of Array.from(element.childNodes)) {
			if (child.nodeType === Node.TEXT_NODE) {
				output.push(child as Text)
				continue
			}
			if (child.nodeType !== Node.ELEMENT_NODE) continue
			const childElement = child as Element
			const style = win.getComputedStyle(childElement)
			if (
				style.display === "contents" &&
				style.getPropertyValue("content-visibility") !== "hidden"
			) {
				visit(childElement)
			}
		}
	}

	visit(root)
	return output
}

export function hasRenderableTextThroughDisplayContents(root: Element): boolean {
	const win = root.ownerDocument.defaultView
	if (!win) return false
	return collectTextNodesThroughDisplayContents(root).some((textNode) => {
		if (textNode.parentElement === root) return false
		const owner = textNode.parentElement ?? root
		return hasRenderableText({
			text: textNode.textContent ?? "",
			whiteSpace: win.getComputedStyle(owner).whiteSpace,
		})
	})
}
