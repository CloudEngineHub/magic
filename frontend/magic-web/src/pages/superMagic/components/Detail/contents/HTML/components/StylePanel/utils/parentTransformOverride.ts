/**
 * Pin a Radix popper wrapper so fixed popovers use viewport coordinates.
 * Restore only our own writes, and only when the popover closes.
 */

const PINNED_TRANSFORM = "none"
const PINNED_ORIGIN = "0px"

/** Keep the wrapper from translating after we set viewport-fixed content. */
export function pinFixedPopoverWrapper(parent: HTMLElement): void {
	parent.style.setProperty("transform", PINNED_TRANSFORM, "important")
	parent.style.setProperty("left", PINNED_ORIGIN, "important")
	parent.style.setProperty("top", PINNED_ORIGIN, "important")
}

function restorePinnedProperty(
	parent: HTMLElement,
	property: "transform" | "left" | "top",
	previousValue: string,
	previousPriority: string,
	pinnedValue: string,
) {
	if (parent.style.getPropertyValue(property) !== pinnedValue) return
	if (parent.style.getPropertyPriority(property) !== "important") return
	if (previousValue) {
		parent.style.setProperty(property, previousValue, previousPriority || undefined)
		return
	}
	parent.style.removeProperty(property)
}

export function neutralizeParentTransform(node: HTMLElement): (() => void) | undefined {
	const parent = node.parentElement
	if (!parent || parent === document.body) return

	const previousValue = parent.style.getPropertyValue("transform")
	const previousPriority = parent.style.getPropertyPriority("transform")
	const previousLeft = parent.style.getPropertyValue("left")
	const previousLeftPriority = parent.style.getPropertyPriority("left")
	const previousTop = parent.style.getPropertyValue("top")
	const previousTopPriority = parent.style.getPropertyPriority("top")

	pinFixedPopoverWrapper(parent)

	return function restoreParentTransform() {
		restorePinnedProperty(
			parent,
			"transform",
			previousValue,
			previousPriority,
			PINNED_TRANSFORM,
		)
		restorePinnedProperty(parent, "left", previousLeft, previousLeftPriority, PINNED_ORIGIN)
		restorePinnedProperty(parent, "top", previousTop, previousTopPriority, PINNED_ORIGIN)
	}
}
