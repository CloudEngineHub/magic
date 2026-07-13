import {
	useRef,
	useState,
	type ComponentProps,
	type MouseEventHandler,
	type PointerEventHandler,
	type RefCallback,
	type RefObject,
} from "react"
import type { OptionItem } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import type { TemplateCanvasItem } from "./canvasLayout"
import {
	getCanvasEdgeCursor,
	type CanvasEdgeCursor,
	type SlidesTemplateCanvasTile,
	type SlidesTemplatePreviewFocus,
} from "./canvasInteraction"
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
	isCanvasFocusSettling: boolean
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
	isCanvasFocusSettling,
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
	// 低比例下单屏会显示上百张封面，循环动画需要额外复制封面节点；此时动画细节不可辨识，保留静态画布。
	const isIdleAnimationActive = isIdle && canvasScale >= 0.8
	const pointerActivityOriginRef = useRef<{ x: number; y: number } | null>(null)
	const [edgeCursor, setEdgeCursor] = useState<CanvasEdgeCursor | null>(null)

	function updateEdgeCursor(event: {
		currentTarget: HTMLDivElement
		clientX: number
		clientY: number
	}) {
		if (isPreviewOpen) return
		const nextCursor = getCanvasEdgeCursor(event.currentTarget.getBoundingClientRect(), event)
		setEdgeCursor((currentCursor) =>
			currentCursor === nextCursor ? currentCursor : nextCursor,
		)
	}

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
			className="relative size-full touch-none select-none overflow-hidden bg-[#101114]"
			style={{
				cursor: isPreviewOpen
					? "default"
					: isDragging
						? "grabbing"
						: (edgeCursor ?? "grab"),
			}}
			onPointerDown={(event) => {
				markActive()
				updateEdgeCursor(event)
				onPointerDown(event)
			}}
			onPointerMove={(event) => {
				markPointerActivity(event.clientX, event.clientY)
				updateEdgeCursor(event)
				onPointerMove(event)
			}}
			onPointerUp={(event) => {
				markActive()
				updateEdgeCursor(event)
				onPointerUp(event)
			}}
			onPointerCancel={(event) => {
				markActive()
				setEdgeCursor(null)
				onPointerCancel(event)
			}}
			onPointerLeave={(event) => {
				pointerActivityOriginRef.current = null
				markActive()
				setEdgeCursor(null)
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
				isCanvasFocusSettling={isCanvasFocusSettling}
				isCanvasMoving={isCanvasMoving}
				isIdleAnimationActive={isIdleAnimationActive}
				keepIdleLoopsMounted={canvasScale >= 0.8}
				prioritizeCoverLoading={!isDragging && !isCanvasMoving}
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
