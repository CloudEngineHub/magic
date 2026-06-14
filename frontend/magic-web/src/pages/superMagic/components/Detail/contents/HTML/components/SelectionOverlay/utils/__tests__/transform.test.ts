import { describe, expect, it, vi } from "vitest"
import { getElementVisualRect, offsetRect, transformRect } from "../transform"

function mockRect(element: HTMLElement, rect: Partial<DOMRect>) {
	element.getBoundingClientRect = vi.fn(
		() =>
			({
				top: 0,
				left: 0,
				width: 0,
				height: 0,
				right: 0,
				bottom: 0,
				x: 0,
				y: 0,
				toJSON: () => ({}),
				...rect,
			}) as DOMRect,
	)
}

describe("SelectionOverlay transform utils", () => {
	it("uses the iframe window when reading transforms from iframe elements", () => {
		const iframe = document.createElement("iframe")
		document.body.appendChild(iframe)
		const iframeWindow = iframe.contentWindow
		const iframeDocument = iframe.contentDocument
		expect(iframeWindow).toBeTruthy()
		expect(iframeDocument).toBeTruthy()
		if (!iframeWindow || !iframeDocument) throw new Error("iframe unavailable")

		const element = iframeDocument.createElement("div")
		iframeDocument.body.appendChild(element)
		Object.defineProperties(element, {
			offsetWidth: { configurable: true, value: 100 },
			offsetHeight: { configurable: true, value: 50 },
		})
		mockRect(element, {
			top: 10,
			left: 20,
			width: 50,
			height: 100,
			right: 70,
			bottom: 110,
			x: 20,
			y: 10,
		})

		const parentGetComputedStyle = vi
			.spyOn(window, "getComputedStyle")
			.mockReturnValue({ transform: "none", webkitTransform: "none" } as CSSStyleDeclaration)
		const iframeGetComputedStyle = vi.spyOn(iframeWindow, "getComputedStyle").mockReturnValue({
			transform: "matrix(0, 1, -1, 0, 0, 0)",
			webkitTransform: "matrix(0, 1, -1, 0, 0, 0)",
		} as CSSStyleDeclaration)

		const rect = getElementVisualRect(element)
		expect(rect.top).toBeCloseTo(35)
		expect(rect.left).toBeCloseTo(-5)
		expect(rect.width).toBeCloseTo(100)
		expect(rect.height).toBeCloseTo(50)
		expect(parentGetComputedStyle).not.toHaveBeenCalled()
		expect(iframeGetComputedStyle).toHaveBeenCalledWith(element)

		parentGetComputedStyle.mockRestore()
		iframeGetComputedStyle.mockRestore()
		iframe.remove()
	})

	it("uses the visual rect when a selected child is inside a scaled parent", () => {
		const element = document.createElement("div")
		Object.defineProperties(element, {
			offsetWidth: { configurable: true, value: 400 },
			offsetHeight: { configurable: true, value: 200 },
		})
		mockRect(element, {
			top: 60,
			left: 40,
			width: 200,
			height: 100,
			right: 240,
			bottom: 160,
			x: 40,
			y: 60,
		})

		expect(getElementVisualRect(element)).toEqual({
			top: 60,
			left: 40,
			width: 200,
			height: 100,
		})
	})

	it("prefers iframe DOM rect over stale reported rect without touching iframe runtime", () => {
		const iframeDocument = document.implementation.createHTMLDocument("iframe")
		const target = iframeDocument.createElement("div")
		target.id = "target"
		iframeDocument.body.appendChild(target)

		Object.defineProperties(target, {
			offsetWidth: { configurable: true, value: 400 },
			offsetHeight: { configurable: true, value: 200 },
		})
		mockRect(target, {
			top: 60,
			left: 40,
			width: 200,
			height: 100,
			right: 240,
			bottom: 160,
			x: 40,
			y: 60,
		})

		const iframe = document.createElement("iframe")
		Object.defineProperties(iframe, {
			contentDocument: { configurable: true, value: iframeDocument },
		})
		mockRect(iframe, {
			top: 100,
			left: 200,
			width: 500,
			height: 500,
			right: 700,
			bottom: 600,
			x: 200,
			y: 100,
		})

		const ref = { current: iframe } as React.RefObject<HTMLIFrameElement>

		expect(
			transformRect(
				{ top: 60, left: 40, width: 400, height: 200 },
				ref,
				true,
				0.5,
				"#target",
			),
		).toEqual({
			top: 130,
			left: 220,
			width: 100,
			height: 50,
		})
	})

	it("converts viewport rects into overlay-local rects", () => {
		expect(
			offsetRect(
				{ top: 251.5, left: 695.75, width: 477.5, height: 631.4 },
				{ top: 51.5, left: 297.25 },
			),
		).toEqual({
			top: 200,
			left: 398.5,
			width: 477.5,
			height: 631.4,
		})
	})
})
