import {
	useRef,
	type ComponentProps,
	type MouseEventHandler,
	type PointerEventHandler,
	type RefCallback,
	type RefObject,
} from "react"
import { cn } from "@/lib/utils"
import type { OptionItem } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import type { TemplateCanvasItem } from "./canvasLayout"
import type { SlidesTemplateCanvasTile, SlidesTemplatePreviewFocus } from "./canvasInteraction"
import SlidesTemplateCanvasControls from "./SlidesTemplateCanvasControls"
import SlidesTemplateCanvasItemsLayer from "./SlidesTemplateCanvasItemsLayer"
import SlidesTemplateCanvasStatus from "./SlidesTemplateCanvasStatus"
import SlidesTemplateInlinePreview from "./SlidesTemplateInlinePreview"
import {
	SLIDES_TEMPLATE_CANVAS_POINTER_ACTIVITY_THRESHOLD,
	useSlidesTemplateCanvasIdle,
} from "./useSlidesTemplateCanvasIdle"

interface SlidesTemplateCanvasSurfaceProps {
	canZoomIn: boolean
	canZoomOut: boolean
	canvasItems: Array<TemplateCanvasItem<SlidesTemplateCanvasTile>>
	canvasScale: number
	bottomEdgeInset?: number
	contentRef: RefObject<HTMLDivElement | null>
	focusedAnchorTileId: string
	isDragging: boolean
	isCanvasMoving: boolean
	isInitialLoading: boolean
	isLoading: boolean
	isLoadingMore: boolean
	isRefreshing: boolean
	onCanvasClickCapture: MouseEventHandler<HTMLDivElement>
	onControlMove: ComponentProps<typeof SlidesTemplateCanvasControls>["onMove"]
	onFindSimilarColors?: (template: OptionItem) => void
	onPointerCancel: PointerEventHandler<HTMLDivElement>
	onPointerDown: PointerEventHandler<HTMLDivElement>
	onPointerLeave: PointerEventHandler<HTMLDivElement>
	onPointerMove: PointerEventHandler<HTMLDivElement>
	onPointerUp: PointerEventHandler<HTMLDivElement>
	onPreviewClose: () => void
	onPreviewToggle: (anchorTileId: string, tile: SlidesTemplateCanvasTile) => void
	onResetView: () => void
	onTemplateSelect: (template: OptionItem) => void
	onZoomIn: () => void
	onZoomOut: () => void
	previewFocus: SlidesTemplatePreviewFocus | null
	selectedTemplate?: OptionItem | null
	selectedTemplateValue: string
	setViewportNode: RefCallback<HTMLDivElement>
	templateCount: number
	visibleCanvasItems: Array<TemplateCanvasItem<SlidesTemplateCanvasTile>>
}

export default function SlidesTemplateCanvasSurface({
	canZoomIn,
	canZoomOut,
	canvasItems,
	canvasScale,
	bottomEdgeInset,
	contentRef,
	focusedAnchorTileId,
	isDragging,
	isCanvasMoving,
	isInitialLoading,
	isLoading,
	isLoadingMore,
	isRefreshing,
	onCanvasClickCapture,
	onControlMove,
	onFindSimilarColors,
	onPointerCancel,
	onPointerDown,
	onPointerLeave,
	onPointerMove,
	onPointerUp,
	onPreviewClose,
	onPreviewToggle,
	onResetView,
	onTemplateSelect,
	onZoomIn,
	onZoomOut,
	previewFocus,
	selectedTemplate,
	selectedTemplateValue,
	setViewportNode,
	templateCount,
	visibleCanvasItems,
}: SlidesTemplateCanvasSurfaceProps) {
	const isPreviewOpen = previewFocus !== null
	const { isIdle, markActive } = useSlidesTemplateCanvasIdle({
		disabled:
			isDragging ||
			isCanvasMoving ||
			isPreviewOpen ||
			Boolean(selectedTemplate) ||
			Boolean(focusedAnchorTileId) ||
			isInitialLoading ||
			isRefreshing,
	})
	const pointerActivityOriginRef = useRef<{ x: number; y: number } | null>(null)

	function markPointerActivity(clientX: number, clientY: number) {
		const origin = pointerActivityOriginRef.current
		if (!origin) {
			pointerActivityOriginRef.current = { x: clientX, y: clientY }
			return
		}

		if (
			Math.hypot(clientX - origin.x, clientY - origin.y) <
			SLIDES_TEMPLATE_CANVAS_POINTER_ACTIVITY_THRESHOLD
		) {
			return
		}

		pointerActivityOriginRef.current = { x: clientX, y: clientY }
		markActive()
	}

	return (
		<div
			ref={setViewportNode}
			data-testid="slides-template-canvas"
			className={cn(
				"relative size-full touch-none select-none overflow-hidden bg-[#101114]",
				isDragging ? "cursor-grabbing" : "cursor-grab",
			)}
			onPointerDown={(event) => {
				markActive()
				onPointerDown(event)
			}}
			onPointerMove={(event) => {
				markPointerActivity(event.clientX, event.clientY)
				onPointerMove(event)
			}}
			onPointerUp={(event) => {
				markActive()
				onPointerUp(event)
			}}
			onPointerCancel={(event) => {
				markActive()
				onPointerCancel(event)
			}}
			onPointerLeave={(event) => {
				pointerActivityOriginRef.current = null
				markActive()
				onPointerLeave(event)
			}}
			onWheelCapture={markActive}
			onFocusCapture={markActive}
			onKeyDownCapture={markActive}
			onClickCapture={(event) => {
				markActive()
				onCanvasClickCapture(event)
			}}
		>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 opacity-[0.24] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:72px_72px]"
			/>
			<SlidesTemplateCanvasItemsLayer
				canvasItems={canvasItems}
				contentRef={contentRef}
				isIdleAnimationActive={isIdle}
				visibleCanvasItems={visibleCanvasItems}
				focusedAnchorTileId={focusedAnchorTileId}
				selectedTemplateValue={selectedTemplateValue}
				onFindSimilarColors={onFindSimilarColors}
				onTemplateSelect={onTemplateSelect}
				onPreviewClick={onPreviewToggle}
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#101114_0%,transparent_12%,transparent_88%,#101114_100%),linear-gradient(to_bottom,#101114_0%,transparent_14%,transparent_84%,#101114_100%)]"
			/>
			<SlidesTemplateInlinePreview
				focus={previewFocus}
				selectedTemplate={selectedTemplate}
				onClose={onPreviewClose}
				onFindSimilarColors={onFindSimilarColors}
				onTemplateSelect={onTemplateSelect}
			/>
			{isPreviewOpen ? null : (
				<SlidesTemplateCanvasControls
					scale={canvasScale}
					bottomEdgeInset={bottomEdgeInset}
					canZoomIn={canZoomIn}
					canZoomOut={canZoomOut}
					onZoomIn={onZoomIn}
					onZoomOut={onZoomOut}
					onReset={onResetView}
					onMove={onControlMove}
				/>
			)}
			<SlidesTemplateCanvasStatus
				isInitialLoading={isInitialLoading}
				isLoading={isLoading}
				isLoadingMore={isLoadingMore}
				isRefreshing={isRefreshing}
				templateCount={templateCount}
			/>
		</div>
	)
}
