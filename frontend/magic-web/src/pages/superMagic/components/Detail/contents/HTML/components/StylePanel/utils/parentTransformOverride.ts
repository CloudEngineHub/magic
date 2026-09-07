/**
 * Temporarily drop an ancestor transform so fixed popovers
 * can use viewport coordinates. Restore only our own write.
 */
export function neutralizeParentTransform(node: HTMLElement): (() => void) | undefined {
	const parent = node.parentElement
	if (!parent || parent === document.body) return
	if (getComputedStyle(parent).transform === "none") return

	const previousValue = parent.style.getPropertyValue("transform")
	const previousPriority = parent.style.getPropertyPriority("transform")
	parent.style.setProperty("transform", "none", "important")

	return function restoreParentTransform() {
		if (parent.style.getPropertyValue("transform") !== "none") return
		if (parent.style.getPropertyPriority("transform") !== "important") return
		if (previousValue) {
			parent.style.setProperty("transform", previousValue, previousPriority || undefined)
			return
		}
		parent.style.removeProperty("transform")
	}
}
