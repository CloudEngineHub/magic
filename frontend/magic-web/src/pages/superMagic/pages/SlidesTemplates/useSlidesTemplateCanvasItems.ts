import { useMemo } from "react"
import type { OptionItem } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import { getFeaturedSlidesTemplateTag } from "@/pages/superMagic/components/MainInputContainer/panels/slides-preset/templateMeta"
import {
	SLIDES_TEMPLATE_CANVAS_DEFAULT_ITEM_SIZE,
	SLIDES_TEMPLATE_CANVAS_DEFAULT_ITEM_SPAN,
	SLIDES_TEMPLATE_CANVAS_FEATURED_ITEM_SIZE,
	SLIDES_TEMPLATE_CANVAS_FEATURED_ITEM_SPAN,
	buildTemplateCanvasItems,
	getTemplateCanvasBounds,
} from "./canvasLayout"
import { buildTemplateCanvasTiles, type SlidesTemplateCanvasTile } from "./canvasInteraction"

interface UseSlidesTemplateCanvasItemsInput {
	templates: OptionItem[]
}

function getSlidesTemplateCanvasTileSize(tile: SlidesTemplateCanvasTile) {
	return getFeaturedSlidesTemplateTag(tile.template)
		? SLIDES_TEMPLATE_CANVAS_FEATURED_ITEM_SIZE
		: SLIDES_TEMPLATE_CANVAS_DEFAULT_ITEM_SIZE
}

function getSlidesTemplateCanvasTileSpan(tile: SlidesTemplateCanvasTile) {
	return getFeaturedSlidesTemplateTag(tile.template)
		? SLIDES_TEMPLATE_CANVAS_FEATURED_ITEM_SPAN
		: SLIDES_TEMPLATE_CANVAS_DEFAULT_ITEM_SPAN
}

export function useSlidesTemplateCanvasItems({ templates }: UseSlidesTemplateCanvasItemsInput) {
	const canvasTiles = useMemo(() => buildTemplateCanvasTiles(templates), [templates])
	const canvasItems = useMemo(
		() =>
			buildTemplateCanvasItems(canvasTiles, {
				getItemSize: getSlidesTemplateCanvasTileSize,
				getItemSpan: getSlidesTemplateCanvasTileSpan,
			}),
		[canvasTiles],
	)
	const bounds = useMemo(() => getTemplateCanvasBounds(canvasItems), [canvasItems])

	return {
		canvasItems,
		contentBounds: bounds,
		templateBounds: bounds,
	}
}
