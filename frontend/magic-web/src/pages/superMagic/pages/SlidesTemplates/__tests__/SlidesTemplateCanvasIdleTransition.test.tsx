import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import SlidesTemplateCanvasTileItem from "../SlidesTemplateCanvasTileItem"
import { SLIDES_TEMPLATE_CANVAS_DEFAULT_ITEM_SIZE } from "../canvasLayout"
import { isCanvasDragBlockedTarget, type SlidesTemplateCanvasTile } from "../canvasInteraction"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		i18n: { language: "en_US" },
		t: (key: string) => key,
	}),
}))

const tile: SlidesTemplateCanvasTile = {
	id: "template-1:cover:0",
	imageUrl: "https://example.com/template-1.png",
	kind: "cover",
	template: {
		value: "template-1",
		label: "Template 1",
		preview_image_urls: [],
	},
}

function renderTile(isIdleAnimationActive: boolean, onTemplateSelect = vi.fn()) {
	return (
		<SlidesTemplateCanvasTileItem
			anchorTileId="template-1:0:0"
			column={0}
			focusedAnchorTileId=""
			idleLoop={{ column: 0, delay: 0, direction: -1, distance: 552, duration: 46 }}
			imageLoading="eager"
			isIdleAnimationActive={isIdleAnimationActive}
			onPreviewClick={vi.fn()}
			onTemplateSelect={onTemplateSelect}
			position={{ x: 0, y: 0 }}
			reduceMotion={false}
			selectedTemplateValue=""
			shouldPlayIntro={false}
			size={SLIDES_TEMPLATE_CANVAS_DEFAULT_ITEM_SIZE}
			tile={tile}
			visibleIndex={0}
		/>
	)
}

describe("SlidesTemplateCanvas idle transition", () => {
	it("keeps the same loop layer mounted when interaction pauses the animation", async () => {
		const onTemplateSelect = vi.fn()
		const view = render(renderTile(true, onTemplateSelect))

		await waitFor(() => {
			expect(screen.getAllByTestId("slides-template-loop-cover")).toHaveLength(2)
		})

		view.rerender(renderTile(false, onTemplateSelect))

		expect(screen.getAllByTestId("slides-template-loop-cover")).toHaveLength(2)
		const loopCover = screen.getAllByTestId("slides-template-loop-cover")[0]
		expect(isCanvasDragBlockedTarget(loopCover)).toBe(false)
		fireEvent.click(loopCover)
		expect(onTemplateSelect).toHaveBeenCalledWith(tile.template)
	})
})
