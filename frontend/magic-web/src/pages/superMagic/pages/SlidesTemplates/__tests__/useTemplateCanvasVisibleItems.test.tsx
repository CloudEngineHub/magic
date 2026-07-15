import { renderHook } from "@testing-library/react"
import { createRef } from "react"
import { describe, expect, it, vi } from "vitest"
import { buildTemplateCanvasItems, type TemplateCanvasPoint } from "../canvasLayout"
import type { SlidesTemplateCanvasTile } from "../canvasInteraction"
import {
	getRebasedSlidesTemplateCanvasOffset,
	getSlidesTemplateCanvasLoopMetrics,
} from "../canvasLoop"
import { useTemplateCanvasVisibleItems } from "../useTemplateCanvasVisibleItems"

function createTile(index: number): SlidesTemplateCanvasTile {
	return {
		id: `template-${index}`,
		kind: "cover",
		template: {
			label: `Template ${index}`,
			value: `template-${index}`,
		},
	}
}

describe("useTemplateCanvasVisibleItems", () => {
	it("rebases the live offset before rendering a changed loop period", () => {
		const previousItems = buildTemplateCanvasItems([createTile(1)])
		const nextItems = buildTemplateCanvasItems(
			Array.from({ length: 12 }, (_, index) => createTile(index + 1)),
		)
		const previousLoopMetrics = getSlidesTemplateCanvasLoopMetrics(previousItems)
		const nextLoopMetrics = getSlidesTemplateCanvasLoopMetrics(nextItems)
		const scaleRef = { current: 0.72 }
		const offsetRef = {
			current: {
				x: -previousLoopMetrics.width * 6 * scaleRef.current,
				y: previousLoopMetrics.height * 3 * scaleRef.current,
			},
		}
		const initialOffset = { ...offsetRef.current }
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
		const viewportRef = createRef<HTMLDivElement>()
		viewportRef.current = viewport
		const onOffsetRebase = vi.fn()
		const expectedOffset = getRebasedSlidesTemplateCanvasOffset({
			nextLoopMetrics,
			offset: initialOffset,
			previousLoopMetrics,
			scale: scaleRef.current,
		})

		const { rerender } = renderHook(
			({
				canvasItems,
				loopMetrics,
			}: {
				canvasItems: typeof previousItems
				loopMetrics: typeof previousLoopMetrics
			}) =>
				useTemplateCanvasVisibleItems({
					canvasItems,
					loopMetrics,
					onOffsetRebase,
					offsetRef,
					resetKey: "all:",
					scaleRef,
					viewportRef,
				}),
			{
				initialProps: {
					canvasItems: previousItems,
					loopMetrics: previousLoopMetrics,
				},
			},
		)

		rerender({ canvasItems: nextItems, loopMetrics: nextLoopMetrics })

		expect(offsetRef.current).toEqual<TemplateCanvasPoint>(expectedOffset)
		expect(onOffsetRebase).toHaveBeenCalledTimes(1)
	})
})
