import { renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import useVectorContentLayout, { getVectorDisplaySize } from "../useVectorContentLayout"

describe("getVectorDisplaySize", () => {
	it("uses the SVG viewBox as the vector's intrinsic dimensions", () => {
		const wrapper = document.createElement("div")
		wrapper.innerHTML = '<svg viewBox="0 0 800 400"></svg>'
		const svg = wrapper.querySelector("svg") as SVGSVGElement

		expect(getVectorDisplaySize(svg, 1.5)).toEqual({
			width: 1200,
			height: 600,
		})
	})

	it("falls back to explicit SVG dimensions when there is no viewBox", () => {
		const wrapper = document.createElement("div")
		wrapper.innerHTML = '<svg width="320" height="180"></svg>'
		const svg = wrapper.querySelector("svg") as SVGSVGElement

		expect(getVectorDisplaySize(svg, 2)).toEqual({
			width: 640,
			height: 360,
		})
	})

	it("updates the SVG's real layout size as the preview scale changes", () => {
		const container = document.createElement("div")
		container.innerHTML = '<svg viewBox="0 0 800 400"></svg>'
		const svg = container.querySelector("svg") as SVGSVGElement
		const contentRef = { current: container }

		const { rerender, unmount } = renderHook(
			({ scale }) => useVectorContentLayout(contentRef, true, scale, "diagram"),
			{ initialProps: { scale: 0.5 } },
		)

		expect(svg.style.width).toBe("400px")
		expect(svg.style.height).toBe("200px")
		expect(svg.style.maxWidth).toBe("none")

		rerender({ scale: 2 })

		expect(svg.style.width).toBe("1600px")
		expect(svg.style.height).toBe("800px")

		unmount()
		expect(svg.style.cssText).toBe("")
	})
})
