import { useReducedMotion } from "framer-motion"
import { useEffect, useMemo, useRef, type CSSProperties, type RefObject } from "react"
import type { OptionItem } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import type { TemplateCanvasItem } from "./canvasLayout"
import { EAGER_TEMPLATE_COVER_COUNT, type SlidesTemplateCanvasTile } from "./canvasInteraction"
import SlidesTemplateCanvasTileItem from "./SlidesTemplateCanvasTileItem"
import SlidesTemplateCanvasLoopColumn, {
	type SlidesTemplateCanvasColumnItem,
} from "./SlidesTemplateCanvasLoopColumn"
import { resolveSlidesTemplateCanvasIdleLoops } from "./canvasIdleLoop"

interface SlidesTemplateCanvasItemsLayerProps {
	contentRef: RefObject<HTMLDivElement | null>
	focusedAnchorTileId: string
	isIdleAnimationActive: boolean
	onPreviewClick: (anchorTileId: string, tile: SlidesTemplateCanvasTile) => void
	onTemplateSelect: (template: OptionItem) => void
	selectedTemplateValue: string
	visibleCanvasItems: Array<TemplateCanvasItem<SlidesTemplateCanvasTile>>
}

const contentStyle = {
	transform: "translate3d(0px, 0px, 0) scale(1)",
	"--slides-template-canvas-action-scale": "1",
} as CSSProperties

export default function SlidesTemplateCanvasItemsLayer({
	contentRef,
	focusedAnchorTileId,
	isIdleAnimationActive,
	onPreviewClick,
	onTemplateSelect,
	selectedTemplateValue,
	visibleCanvasItems,
}: SlidesTemplateCanvasItemsLayerProps) {
	const reduceMotion = Boolean(useReducedMotion())
	const hasPlayedIntroRef = useRef(false)
	const shouldPlayIntro = !hasPlayedIntroRef.current && visibleCanvasItems.length > 0
	const idleLoopsByColumn = useMemo(
		() =>
			new Map(
				resolveSlidesTemplateCanvasIdleLoops(visibleCanvasItems).map((loop) => [
					loop.column,
					loop,
				]),
			),
		[visibleCanvasItems],
	)
	const { columnItems, standaloneItems } = useMemo(() => {
		const nextColumnItems = new Map<number, SlidesTemplateCanvasColumnItem[]>()
		const nextStandaloneItems: SlidesTemplateCanvasColumnItem[] = []

		visibleCanvasItems.forEach((canvasItem, visibleIndex) => {
			const entry = { canvasItem, visibleIndex }
			if (canvasItem.span.columns !== 1) {
				nextStandaloneItems.push(entry)
				return
			}

			const currentItems = nextColumnItems.get(canvasItem.grid.x) ?? []
			currentItems.push(entry)
			nextColumnItems.set(canvasItem.grid.x, currentItems)
		})

		return { columnItems: nextColumnItems, standaloneItems: nextStandaloneItems }
	}, [visibleCanvasItems])

	useEffect(() => {
		if (visibleCanvasItems.length > 0) hasPlayedIntroRef.current = true
	}, [visibleCanvasItems.length])

	return (
		<div
			ref={contentRef}
			data-testid="slides-template-canvas-content"
			className="absolute left-1/2 top-1/2 size-0 will-change-transform"
			style={contentStyle}
		>
			{Array.from(columnItems.entries()).map(([column, items]) => (
				<SlidesTemplateCanvasLoopColumn
					key={column}
					items={items}
					idleLoop={idleLoopsByColumn.get(column) ?? null}
					isIdleAnimationActive={isIdleAnimationActive}
					reduceMotion={reduceMotion}
					focusedAnchorTileId={focusedAnchorTileId}
					selectedTemplateValue={selectedTemplateValue}
					onTemplateSelect={onTemplateSelect}
					onPreviewClick={onPreviewClick}
					shouldPlayIntro={shouldPlayIntro}
				/>
			))}
			{standaloneItems.map(({ canvasItem, visibleIndex }) => {
				const { grid, item: tile, position, size } = canvasItem
				const anchorTileId = `${tile.id}:${grid.x}:${grid.y}`

				return (
					<SlidesTemplateCanvasTileItem
						key={anchorTileId}
						anchorTileId={anchorTileId}
						column={grid.x}
						tile={tile}
						position={position}
						reduceMotion={reduceMotion}
						size={size}
						imageLoading={visibleIndex < EAGER_TEMPLATE_COVER_COUNT ? "eager" : "lazy"}
						focusedAnchorTileId={focusedAnchorTileId}
						selectedTemplateValue={selectedTemplateValue}
						onTemplateSelect={onTemplateSelect}
						onPreviewClick={onPreviewClick}
						shouldPlayIntro={shouldPlayIntro}
						visibleIndex={visibleIndex}
					/>
				)
			})}
		</div>
	)
}
