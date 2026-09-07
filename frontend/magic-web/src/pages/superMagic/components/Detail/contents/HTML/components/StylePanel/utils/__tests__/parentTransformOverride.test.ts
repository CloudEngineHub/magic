import { afterEach, describe, expect, it, vi } from "vitest"
import { neutralizeParentTransform } from "../parentTransformOverride"

describe("neutralizeParentTransform", () => {
	const originalGetComputedStyle = window.getComputedStyle

	afterEach(() => {
		window.getComputedStyle = originalGetComputedStyle
		document.body.replaceChildren()
		vi.restoreAllMocks()
	})

	function createTree(parentTransform = "translate(12px, 8px)") {
		const parent = document.createElement("div")
		const child = document.createElement("div")
		parent.appendChild(child)
		document.body.appendChild(parent)
		if (parentTransform) parent.style.setProperty("transform", parentTransform)
		return { parent, child }
	}

	function mockComputedTransform(parent: HTMLElement, transform: string) {
		window.getComputedStyle = ((element: Element) => {
			if (element === parent) {
				return { transform } as CSSStyleDeclaration
			}
			return originalGetComputedStyle(element)
		}) as typeof window.getComputedStyle
	}

	it("restores the authored parent transform after cleanup", () => {
		const { parent, child } = createTree("translate(12px, 8px)")
		mockComputedTransform(parent, "matrix(1, 0, 0, 1, 12, 8)")

		const restore = neutralizeParentTransform(child)
		expect(parent.style.getPropertyValue("transform")).toBe("none")
		expect(parent.style.getPropertyPriority("transform")).toBe("important")

		restore?.()
		expect(parent.style.getPropertyValue("transform")).toBe("translate(12px, 8px)")
		expect(parent.style.getPropertyPriority("transform")).toBe("")
	})

	it("removes the override when the parent had no inline transform", () => {
		const { parent, child } = createTree("")
		mockComputedTransform(parent, "matrix(1, 0, 0, 1, 4, 0)")

		const restore = neutralizeParentTransform(child)
		expect(parent.style.getPropertyValue("transform")).toBe("none")

		restore?.()
		expect(parent.style.getPropertyValue("transform")).toBe("")
		expect(parent.style.getPropertyPriority("transform")).toBe("")
	})

	it("keeps a later writer value instead of restoring a stale override", () => {
		const { parent, child } = createTree("translateX(10px)")
		mockComputedTransform(parent, "matrix(1, 0, 0, 1, 10, 0)")

		const restore = neutralizeParentTransform(child)
		parent.style.setProperty("transform", "scale(2)")
		restore?.()

		expect(parent.style.getPropertyValue("transform")).toBe("scale(2)")
	})

	it("leaves the parent unchanged after open, close, and reopen", () => {
		const { parent, child } = createTree("translateY(6px)")
		mockComputedTransform(parent, "matrix(1, 0, 0, 1, 0, 6)")

		const first = neutralizeParentTransform(child)
		first?.()
		const second = neutralizeParentTransform(child)
		second?.()

		expect(parent.style.getPropertyValue("transform")).toBe("translateY(6px)")
		expect(parent.style.getPropertyPriority("transform")).toBe("")
	})
})
