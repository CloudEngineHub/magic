import { useLayoutEffect, useMemo, useRef, type MutableRefObject, type RefObject } from "react"
import type { OptionItem } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import type {
	TemplateCanvasBounds,
	TemplateCanvasItem,
	TemplateCanvasInsets,
	TemplateCanvasPoint,
} from "./canvasLayout"
import { getTemplateKey, type SlidesTemplateCanvasTile } from "./canvasInteraction"

export type SlidesTemplateCanvasInitialAlignment = "center" | "top"

interface UseSlidesTemplateCanvasInitialAlignmentInput {
	contentBounds: TemplateCanvasBounds
	initialAlignment: SlidesTemplateCanvasInitialAlignment
	canvasItems: Array<TemplateCanvasItem<SlidesTemplateCanvasTile>>
	resetKey: string
	scaleRef: MutableRefObject<number>
	setCanvasOffset: (nextOffset: TemplateCanvasPoint) => TemplateCanvasPoint
	viewportInsetsRef: MutableRefObject<Partial<TemplateCanvasInsets> | undefined>
	viewportRef: RefObject<HTMLDivElement | null>
	templates: OptionItem[]
}

function getTemplateSetKey(templates: OptionItem[]) {
	return Array.from(new Set(templates.map(getTemplateKey)))
		.sort()
		.join("|")
}

export function useSlidesTemplateCanvasInitialAlignment({
	contentBounds,
	initialAlignment,
	canvasItems,
	resetKey,
	scaleRef,
	setCanvasOffset,
	viewportInsetsRef,
	viewportRef,
	templates,
}: UseSlidesTemplateCanvasInitialAlignmentInput) {
	const alignedResetKeyRef = useRef("")
	const expectedTemplateSetKey = useMemo(() => getTemplateSetKey(templates), [templates])
	const layoutTemplateSetKey = useMemo(
		() => getTemplateSetKey(canvasItems.map(({ item }) => item.template)),
		[canvasItems],
	)

	useLayoutEffect(() => {
		if (initialAlignment !== "top") {
			alignedResetKeyRef.current = ""
			return
		}
		if (
			alignedResetKeyRef.current === resetKey ||
			expectedTemplateSetKey !== layoutTemplateSetKey ||
			canvasItems.length === 0
		) {
			return
		}

		const viewport = viewportRef.current
		if (!viewport) return
		const { width, height } = viewport.getBoundingClientRect()
		if (width <= 0 || height <= 0) return

		const insets = viewportInsetsRef.current
		const scale = scaleRef.current
		setCanvasOffset({
			x:
				((insets?.left ?? 0) - (insets?.right ?? 0)) / 2 -
				((contentBounds.minX + contentBounds.maxX) / 2) * scale,
			y: (insets?.top ?? 0) - height / 2 - contentBounds.minY * scale,
		})
		alignedResetKeyRef.current = resetKey
	}, [
		contentBounds,
		canvasItems.length,
		expectedTemplateSetKey,
		initialAlignment,
		layoutTemplateSetKey,
		resetKey,
		scaleRef,
		setCanvasOffset,
		viewportInsetsRef,
		viewportRef,
	])
}
