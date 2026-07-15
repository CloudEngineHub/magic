import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useSlidesTemplateCanvasInitialAlignment } from "../useSlidesTemplateCanvasInitialAlignment"

describe("useSlidesTemplateCanvasInitialAlignment", () => {
	it("aligns each new similar-color result set to the top once", () => {
		const templates = [{ label: "Template", value: "template" }]
		const canvasItems = [
			{
				grid: { x: 0, y: 0 },
				index: 0,
				item: {
					id: "template:cover",
					kind: "cover" as const,
					template: templates[0]!,
				},
				position: { x: 100, y: 100 },
				size: { height: 200, width: 200 },
				span: { columns: 1, rows: 1 },
			},
		]
		const viewport = document.createElement("div")
		vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({
			bottom: 600,
			height: 600,
			left: 0,
			right: 800,
			top: 0,
			width: 800,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		})
		const setCanvasOffset = vi.fn((offset) => offset)
		const baseProps = {
			canvasItems,
			contentBounds: { minX: 0, maxX: 200, minY: -100, maxY: 300 },
			initialAlignment: "top" as const,
			resetKey: "similar:first",
			scaleRef: { current: 0.8 },
			setCanvasOffset,
			viewportInsetsRef: { current: { left: 20, right: 60, top: 40 } },
			viewportRef: { current: viewport },
			templates,
		}
		const { rerender } = renderHook(
			(props: typeof baseProps) => useSlidesTemplateCanvasInitialAlignment(props),
			{ initialProps: baseProps },
		)

		expect(setCanvasOffset).toHaveBeenCalledWith({ x: -100, y: -180 })

		rerender({ ...baseProps, contentBounds: { ...baseProps.contentBounds, maxY: 600 } })
		expect(setCanvasOffset).toHaveBeenCalledTimes(1)

		rerender({ ...baseProps, resetKey: "similar:second" })
		expect(setCanvasOffset).toHaveBeenCalledTimes(2)

		const nextTemplates = [{ label: "Next Template", value: "next-template" }]
		rerender({
			...baseProps,
			resetKey: "similar:third",
			templates: nextTemplates,
		})
		expect(setCanvasOffset).toHaveBeenCalledTimes(2)

		rerender({
			...baseProps,
			canvasItems: [
				{
					...canvasItems[0],
					item: {
						id: "next-template:cover",
						kind: "cover" as const,
						template: nextTemplates[0]!,
					},
				},
			],
			resetKey: "similar:third",
			templates: nextTemplates,
		})
		expect(setCanvasOffset).toHaveBeenCalledTimes(3)
	})
})
